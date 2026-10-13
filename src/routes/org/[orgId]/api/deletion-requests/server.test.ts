import { describe, expect, it } from 'vitest';
import { _createDeleteConfig, _createPostConfig } from './+server';
import { createDeletionRequestTestStore } from '$features/deletion-requests/testing.server';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createTestContext as createRatingSchemeTestContext } from '$features/rating-scheme/server/ratingSchemePersistence.test-support.server';
import { withTrainingPersistence } from '$features/training/server/trainingPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';

const _deleteConfig = _createDeleteConfig(createDeletionRequestTestStore(createTestContext().store), {
	async cancelPendingRequest() {
		throw new Error('Unexpected cancellation');
	}
});

const GROUP_ALPHA = '0a000000-0000-4000-8000-000000000001';
const GROUP_BRAVO = '0a000000-0000-4000-8000-000000000002';
const PERSON_ALPHA = '0b000000-0000-4000-8000-000000000001';
const PERSON_BRAVO = '0b000000-0000-4000-8000-000000000002';
const TRAINING_TYPE = '0c000000-0000-4000-8000-000000000001';
const RECORD_ALPHA = '0d000000-0000-4000-8000-000000000001';
const RECORD_BRAVO = '0d000000-0000-4000-8000-000000000002';
const ENTRY_ALPHA = '0e000000-0000-4000-8000-000000000001';
const ENTRY_BRAVO = '0e000000-0000-4000-8000-000000000002';
const MISSING = '0f000000-0000-4000-8000-000000000001';

function createRequesterContext(personnel: 'view' | 'operate' = 'operate') {
	const ctx = createRatingSchemeTestContext(
		withTrainingPersistence({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel,
					training: 'operate',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'operate'
				},
				scopeSet: { kind: 'groups', groupIds: [GROUP_ALPHA] }
			}
		})
	);
	const orgId = ctx.auth.orgId;
	ctx.rawStore.seed('personnel', [
		{
			id: PERSON_ALPHA,
			organization_id: orgId,
			group_id: GROUP_ALPHA,
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'Jane',
			archived_at: null
		},
		{
			id: PERSON_BRAVO,
			organization_id: orgId,
			group_id: GROUP_BRAVO,
			rank: 'SSG',
			last_name: 'Jones',
			first_name: 'Avery',
			archived_at: null
		}
	]);
	ctx.rawStore.seed('training_types', [{ id: TRAINING_TYPE, organization_id: orgId, name: 'CLS' }]);
	ctx.rawStore.seed('personnel_trainings', [
		{ id: RECORD_ALPHA, organization_id: orgId, personnel_id: PERSON_ALPHA, training_type_id: TRAINING_TYPE },
		{ id: RECORD_BRAVO, organization_id: orgId, personnel_id: PERSON_BRAVO, training_type_id: TRAINING_TYPE }
	]);
	ctx.rawStore.seed('rating_scheme_entries', [
		{ id: ENTRY_ALPHA, organization_id: orgId, rated_person_id: PERSON_ALPHA, eval_type: 'NCOER', status: 'active' },
		{ id: ENTRY_BRAVO, organization_id: orgId, rated_person_id: PERSON_BRAVO, eval_type: 'NCOER', status: 'active' }
	]);
	const store = createDeletionRequestTestStore(ctx.rawStore);
	return { ctx, config: _createPostConfig(store) };
}

async function submit(
	requester: ReturnType<typeof createRequesterContext>,
	input: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
	const { ctx, config } = requester;
	try {
		const result = await handleUseCaseRequest(
			config,
			ctx,
			{ userEmail: 'requester@example.test', ...input },
			() => ctx
		);
		const response = config.formatOutput!(result);
		return { status: response.status, body: await response.json() };
	} catch (error) {
		return { status: (error as { status?: number }).status ?? 500, body: null };
	}
}

async function savedRequests(requester: ReturnType<typeof createRequesterContext>) {
	return (
		await requester.ctx.rawStore.findMany<Record<string, unknown>>('deletion_requests', requester.ctx.auth.orgId)
	).map((row) => [row.resource_type, row.resource_id, row.resource_description, row.resource_url, row.status]);
}

describe('/api/deletion-requests route config', () => {
	it('rejects missing identity before looking up a request', async () => {
		const ctx = createTestContext({ auth: { userId: '' } });
		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { id: 'unavailable-request' }, () => ctx)
		).rejects.toMatchObject({
			status: 403
		});
	});

	it('rejects null DELETE payloads with a 400 instead of throwing a type error', async () => {
		await expect(
			handleUseCaseRequest(_deleteConfig, createTestContext(), null, () => createTestContext())
		).rejects.toMatchObject({
			status: 400
		});
	});

	it('describes each request from the loaded resource and ignores client text', async () => {
		const requester = createRequesterContext();
		const orgId = requester.ctx.auth.orgId;
		const forged = { resourceDescription: 'Routine cleanup', resourceUrl: 'https://attacker.example/review' };

		const personnel = await submit(requester, { resourceType: 'personnel', resourceId: PERSON_ALPHA, ...forged });
		const training = await submit(requester, {
			resourceType: 'personnel_training',
			resourceId: RECORD_ALPHA,
			...forged
		});
		const rating = await submit(requester, { resourceType: 'rating_scheme_entry', resourceId: ENTRY_ALPHA, ...forged });

		expect([personnel.status, training.status, rating.status]).toEqual([201, 201, 201]);
		expect(personnel.body).toMatchObject({
			resource_type: 'personnel',
			resource_id: PERSON_ALPHA,
			resource_description: 'Archive SGT Smith, Jane',
			status: 'pending'
		});
		expect(await savedRequests(requester)).toEqual([
			['personnel', PERSON_ALPHA, 'Archive SGT Smith, Jane', `/org/${orgId}/personnel`, 'pending'],
			['personnel_training', RECORD_ALPHA, 'CLS record for SGT Smith', `/org/${orgId}/training`, 'pending'],
			['rating_scheme_entry', ENTRY_ALPHA, 'Rating scheme entry for SGT Smith', `/org/${orgId}/evals`, 'pending']
		]);
	});

	it('creates no request for resources outside the requester scope or missing from the Organization', async () => {
		const requester = createRequesterContext();

		const outcomes = [
			await submit(requester, { resourceType: 'personnel', resourceId: PERSON_BRAVO }),
			await submit(requester, { resourceType: 'personnel', resourceId: MISSING }),
			await submit(requester, { resourceType: 'personnel_training', resourceId: RECORD_BRAVO }),
			await submit(requester, { resourceType: 'rating_scheme_entry', resourceId: ENTRY_BRAVO }),
			await submit(requester, { resourceType: 'rating_scheme_entry', resourceId: MISSING })
		].map((outcome) => outcome.status);

		expect(outcomes).toEqual([404, 404, 403, 403, 404]);
		expect(await savedRequests(requester)).toEqual([]);
	});

	it('requires the owning operation authority behind the approval request', async () => {
		const viewer = createRequesterContext('view');

		expect((await submit(viewer, { resourceType: 'personnel', resourceId: PERSON_ALPHA })).status).toBe(403);
		expect(await savedRequests(viewer)).toEqual([]);
	});

	it('accepts only request types an app workflow submits', async () => {
		const requester = createRequesterContext();

		const outcomes = [
			await submit(requester, { resourceType: 'counseling_record', resourceId: RECORD_ALPHA }),
			await submit(requester, { resourceType: 'training_type', resourceId: TRAINING_TYPE }),
			await submit(requester, { resourceType: 'personnel', resourceId: 'not-a-uuid' })
		].map((outcome) => outcome.status);

		expect(outcomes).toEqual([400, 400, 400]);
		expect(await savedRequests(requester)).toEqual([]);
	});
});

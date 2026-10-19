import { describe, expect, it } from 'vitest';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _patchConfig } from './+server';

const PERSON = '00000000-0000-4000-8000-000000003001';
const OTHER_GROUP_PERSON = '00000000-0000-4000-8000-000000003002';
const CYCLE_TYPE = '00000000-0000-4000-8000-000000003003';
const EXPIRATION_ONLY_TYPE = '00000000-0000-4000-8000-000000003004';
const RECORD = '00000000-0000-4000-8000-000000003005';
const HISTORY = '00000000-0000-4000-8000-000000003006';
const OTHER_GROUP_RECORD = '00000000-0000-4000-8000-000000003007';
const EXPIRATION_ONLY_RECORD = '00000000-0000-4000-8000-000000003008';

function seededContext(auth?: Parameters<typeof createTestContext>[0]) {
	const ctx = createTestContext(auth);
	const orgId = ctx.auth.orgId;
	ctx.store.seed('personnel', [
		{ id: PERSON, organization_id: orgId, group_id: 'group-a' },
		{ id: OTHER_GROUP_PERSON, organization_id: orgId, group_id: 'group-b' }
	]);
	ctx.store.seed('training_types', [
		{ id: CYCLE_TYPE, organization_id: orgId, expiration_months: 12, expiration_date_only: false },
		{ id: EXPIRATION_ONLY_TYPE, organization_id: orgId, expiration_months: null, expiration_date_only: true }
	]);
	ctx.store.seed('personnel_trainings', [
		{
			id: RECORD,
			organization_id: orgId,
			personnel_id: PERSON,
			training_type_id: CYCLE_TYPE,
			completion_date: '2026-03-15',
			expiration_date: '2027-03-15',
			notes: 'Range 4',
			certificate_url: 'https://example.test/cert.pdf',
			created_at: '2026-03-15T12:00:00.000Z',
			updated_at: '2026-03-15T12:00:00.000Z'
		},
		{
			id: EXPIRATION_ONLY_RECORD,
			organization_id: orgId,
			personnel_id: PERSON,
			training_type_id: EXPIRATION_ONLY_TYPE,
			completion_date: '2025-05-01',
			expiration_date: '2026-05-01',
			notes: 'Recorded before the type took per-person dates',
			certificate_url: null
		},
		{
			id: OTHER_GROUP_RECORD,
			organization_id: orgId,
			personnel_id: OTHER_GROUP_PERSON,
			training_type_id: CYCLE_TYPE,
			completion_date: '2026-01-01',
			expiration_date: '2027-01-01',
			notes: null,
			certificate_url: null
		}
	]);
	ctx.store.seed('personnel_training_history', [
		{
			id: HISTORY,
			organization_id: orgId,
			personnel_id: PERSON,
			training_type_id: EXPIRATION_ONLY_TYPE,
			completion_date: null,
			expiration_date: '2025-06-30',
			notes: 'Old card',
			certificate_url: null,
			superseded_at: '2026-01-02T00:00:00.000Z'
		}
	]);
	return ctx;
}

const groupOperator = {
	auth: {
		role: 'member' as const,
		isPrivileged: false,
		capabilityMap: {
			calendar: 'none',
			personnel: 'none',
			training: 'operate',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: 'none'
		} as const,
		scopeSet: { kind: 'groups' as const, groupIds: ['group-a'] }
	}
};

describe('PATCH /api/personnel-trainings/corrections', () => {
	it('corrects the current completion in place and recomputes its expiration from the cycle', async () => {
		const ctx = seededContext(groupOperator);

		const result = await handleUseCaseRequest(
			_patchConfig,
			ctx,
			{ kind: 'current', id: RECORD, completionDate: '2026-03-14', expirationDate: '2030-01-01' },
			() => ctx
		);

		expect(result.entry).toMatchObject({
			id: RECORD,
			personnelId: PERSON,
			trainingTypeId: CYCLE_TYPE,
			completionDate: '2026-03-14',
			expirationDate: '2027-03-14',
			notes: 'Range 4',
			certificateUrl: 'https://example.test/cert.pdf'
		});
		expect(ctx.audit.events).toEqual([
			{
				action: 'training_record.corrected',
				resourceType: 'training_record',
				resourceId: RECORD,
				details: { kind: 'current', personnel_id: PERSON, training_type_id: CYCLE_TYPE, completion_date: '2026-03-14' }
			}
		]);
	});

	it('corrects a superseded completion with the client expiration for an expiration-date-only type', async () => {
		const ctx = seededContext(groupOperator);

		const result = await handleUseCaseRequest(
			_patchConfig,
			ctx,
			{ kind: 'history', id: HISTORY, completionDate: null, expirationDate: '2025-07-31', notes: null },
			() => ctx
		);

		expect(result).toEqual({
			entry: {
				id: HISTORY,
				personnelId: PERSON,
				trainingTypeId: EXPIRATION_ONLY_TYPE,
				completionDate: null,
				expirationDate: '2025-07-31',
				notes: null,
				certificateUrl: null,
				supersededAt: '2026-01-02T00:00:00.000Z'
			}
		});
	});

	it('keeps the completion date an expiration-date-only correction does not send', async () => {
		const ctx = seededContext(groupOperator);

		const result = await handleUseCaseRequest(
			_patchConfig,
			ctx,
			{ kind: 'current', id: EXPIRATION_ONLY_RECORD, expirationDate: '2026-06-30' },
			() => ctx
		);

		expect(result.entry).toMatchObject({
			id: EXPIRATION_ONLY_RECORD,
			completionDate: '2025-05-01',
			expirationDate: '2026-06-30',
			notes: 'Recorded before the type took per-person dates'
		});
	});

	it.each([
		['an unknown id', '00000000-0000-4000-8000-000000003999'],
		["another Organization's id", '00000000-0000-4000-8000-000000003998']
	])('answers 404 for %s', async (_label, id) => {
		const ctx = seededContext();
		ctx.store.seed('personnel_trainings', [
			{
				id: '00000000-0000-4000-8000-000000003998',
				organization_id: 'other-org',
				personnel_id: PERSON,
				training_type_id: CYCLE_TYPE,
				completion_date: '2026-01-01'
			}
		]);

		await expect(
			handleUseCaseRequest(_patchConfig, ctx, { kind: 'current', id, completionDate: '2026-01-02' }, () => ctx)
		).rejects.toMatchObject({ status: 404, message: 'Training record not found' });
	});

	it("refuses an operator another Group's completion and leaves it unchanged", async () => {
		const ctx = seededContext(groupOperator);

		await expect(
			handleUseCaseRequest(
				_patchConfig,
				ctx,
				{ kind: 'current', id: OTHER_GROUP_RECORD, completionDate: '2026-01-02' },
				() => ctx
			)
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findOne('personnel_trainings', ctx.auth.orgId, { id: OTHER_GROUP_RECORD })).toMatchObject({
			completion_date: '2026-01-01'
		});
	});

	it.each([
		['an unknown kind', { kind: 'draft', id: RECORD, completionDate: '2026-01-02' }],
		['a missing completion date', { kind: 'current', id: RECORD }],
		['an impossible date', { kind: 'current', id: RECORD, completionDate: '2026-02-30' }]
	])('answers 400 for %s', async (_label, input) => {
		const ctx = seededContext();

		await expect(handleUseCaseRequest(_patchConfig, ctx, input, () => ctx)).rejects.toMatchObject({ status: 400 });
	});
});

import { describe, expect, it } from 'vitest';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import { createInMemoryTrainingCertificateStore } from '$features/training/server/inMemoryTrainingPersistence.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

const PERSON = '00000000-0000-4000-8000-000000005001';
const OTHER_PERSON = '00000000-0000-4000-8000-000000005002';
const TRAINING_TYPE = '00000000-0000-4000-8000-000000005003';
const RECORD = '00000000-0000-4000-8000-000000005004';
const HISTORY = '00000000-0000-4000-8000-000000005005';
const STORED = `test-org/personnel/${PERSON}/training-certificates/a/card.pdf`;

async function seededContext(currentCertificate: string, auth?: Parameters<typeof createTestContext>[0]) {
	const base = createTestContext(auth);
	const orgId = base.auth.orgId;
	base.store.seed('personnel', [
		{ id: PERSON, organization_id: orgId, group_id: null },
		{ id: OTHER_PERSON, organization_id: orgId, group_id: null }
	]);
	base.store.seed('personnel_trainings', [
		{
			id: RECORD,
			organization_id: orgId,
			personnel_id: PERSON,
			training_type_id: TRAINING_TYPE,
			certificate_url: currentCertificate
		}
	]);
	base.store.seed('personnel_training_history', [
		{
			id: HISTORY,
			organization_id: orgId,
			personnel_id: PERSON,
			training_type_id: TRAINING_TYPE,
			certificate_url: STORED,
			superseded_at: '2026-01-01T00:00:00.000Z'
		}
	]);
	await base.storage.upload('training-certificates', STORED, new Blob(['%PDF']));
	const ctx = {
		...base,
		trainingCertificates: createInMemoryTrainingCertificateStore(base.store, base.storage, orgId)
	};
	return ctx;
}

async function open(ctx: Awaited<ReturnType<typeof seededContext>>, input: Record<string, unknown>) {
	const response = _getConfig.formatOutput(await handleUseCaseRequest(_getConfig, ctx, input, () => ctx));
	return { status: response.status, location: response.headers.get('location') };
}

describe('GET /api/personnel-trainings/certificate', () => {
	it.each([
		['the current completion', { kind: 'current', id: RECORD }],
		['a superseded completion', { kind: 'history', id: HISTORY }]
	])('redirects to a five-minute link for the certificate stored on %s', async (_label, input) => {
		const ctx = await seededContext(STORED);

		expect(await open(ctx, input)).toEqual({
			status: 303,
			location: `https://storage.test/training-certificates/${STORED}?expires=300`
		});
	});

	it.each([
		['a legacy link to another site', 'https://example.test/legacy-cert.pdf'],
		['a protocol-relative link', '//example.test/legacy-cert.pdf'],
		["another Person's stored path", `test-org/personnel/${OTHER_PERSON}/training-certificates/a/card.pdf`],
		['free text', 'Card in the orderly room'],
		['an unsafe path', `test-org/personnel/${PERSON}/training-certificates/../documents/x.pdf`]
	])('answers 404 for %s', async (_label, stored) => {
		const ctx = await seededContext(stored);

		await expect(open(ctx, { kind: 'current', id: RECORD })).rejects.toMatchObject({
			status: 404,
			message: 'Certificate not found'
		});
	});

	it('answers 404 for an unknown completion and 400 for an unknown kind', async () => {
		const ctx = await seededContext(STORED);

		await expect(open(ctx, { kind: 'current', id: '00000000-0000-4000-8000-000000005999' })).rejects.toMatchObject({
			status: 404,
			message: 'Training record not found'
		});
		await expect(open(ctx, { kind: 'draft', id: RECORD })).rejects.toMatchObject({ status: 400 });
	});

	it('refuses a member without Training view', async () => {
		const ctx = await seededContext(STORED, {
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'configure',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});

		await expect(open(ctx, { kind: 'current', id: RECORD })).rejects.toMatchObject({ status: 403 });
	});
});

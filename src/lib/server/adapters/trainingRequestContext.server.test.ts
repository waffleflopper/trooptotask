import { describe, expect, it, vi } from 'vitest';
import { trainingProvider } from '$features/training/server/test-support/trainingProvider.server';
import {
	createTestContext,
	createWritePortsContext
} from '$features/training/server/trainingPersistence.test-support.server';
import { updateTrainingRecord, importTrainingRecords } from '$features/training/index.server';
import { rethrowOrWrap } from './httpAdapter';
import {
	createRequestTrainingCatalogContext,
	createRequestTrainingRosterContext,
	createRequestTrainingBriefingContext
} from './featureRequestContexts.server';
import type { AdmittedOrganizationRequest } from './requestContexts.server';

const PERSON_1 = '00000000-0000-4000-8000-000000003001';
const TRAINING_TYPE = '00000000-0000-4000-8000-000000003002';
const RECORD = '00000000-0000-4000-8000-000000003003';
const ABSENT_RECORD = '00000000-0000-4000-8000-000000003004';

const { getAdminClient } = vi.hoisted(() => ({
	getAdminClient: vi.fn(() => {
		throw new Error('Admin acquisition forbidden');
	})
}));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));

describe('Training request authority', () => {
	it('binds ordinary catalog and completion methods to the admitted client and canonical Organization without generic-store or privileged fallback', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-a' } });
		const { client } = trainingProvider({
			training_types: [
				{ id: 'a', organization_id: 'org-a', name: 'A' },
				{ id: 'b', organization_id: 'org-b', name: 'B' }
			],
			personnel_trainings: [
				{ id: 'r-a', organization_id: 'org-a', personnel_id: 'p-a', training_type_id: 'a' },
				{ id: 'r-b', organization_id: 'org-b', personnel_id: 'p-b', training_type_id: 'b' }
			]
		});
		const request = {
			...ctx,
			auth: { ...ctx.auth },
			supabase: client,
			session: null
		} satisfies AdmittedOrganizationRequest;
		const catalog = createRequestTrainingCatalogContext(request);
		const roster = createRequestTrainingRosterContext(request);
		const reports = createRequestTrainingBriefingContext(request);
		request.auth.orgId = 'org-b';
		expect(await catalog.trainingCatalog.listTypeLabels()).toEqual([{ id: 'a', name: 'A' }]);
		expect(await roster.trainingCompletions.listCompletions()).toEqual([
			{ id: 'r-a', personnelId: 'p-a', trainingTypeId: 'a', notes: null, certificateUrl: null }
		]);
		expect(await reports.trainingCatalog.listTypes()).toEqual([{ id: 'a', name: 'A', organization_id: 'org-a' }]);
		expect(getAdminClient).not.toHaveBeenCalled();
	});
});

describe('Training request failure boundary', () => {
	async function atBoundary(operation: Promise<unknown>) {
		try {
			return await operation;
		} catch (err) {
			rethrowOrWrap(err);
		}
	}

	it('forwards deliberate completion and batch failures with their public status and reason', async () => {
		const ctx = createWritePortsContext();
		await expect(atBoundary(updateTrainingRecord(ctx, {}))).rejects.toMatchObject({
			status: 400,
			body: { message: 'Invalid ID' }
		});
		await expect(atBoundary(updateTrainingRecord(ctx, { id: ABSENT_RECORD }))).rejects.toMatchObject({
			status: 404,
			body: { message: 'Training record not found' }
		});
		await expect(atBoundary(importTrainingRecords(ctx, { records: [] }))).rejects.toMatchObject({
			status: 400,
			body: { message: 'records array is required' }
		});
		expect(await ctx.store.findMany('personnel_trainings', 'test-org')).toEqual([]);
	});

	it('hides a provider error shaped like 404 without changing the saved record', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('personnel', [{ id: PERSON_1, organization_id: 'test-org', group_id: 'group-a' }]);
		ctx.store.seed('training_types', [
			{ id: TRAINING_TYPE, organization_id: 'test-org', expiration_months: 12, expiration_date_only: false }
		]);
		ctx.store.seed('personnel_trainings', [
			{
				id: RECORD,
				organization_id: 'test-org',
				personnel_id: PERSON_1,
				training_type_id: TRAINING_TYPE,
				completion_date: '2025-03-15',
				expiration_date: '2026-03-15',
				notes: 'original',
				certificate_url: 'saved-certificate'
			}
		]);
		const before = await ctx.store.findMany('personnel_trainings', 'test-org');
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(ctx.trainingCompletions, 'patchRecord').mockRejectedValue(
			Object.assign(new Error('private provider constraint detail'), { status: 404 })
		);
		try {
			await expect(atBoundary(updateTrainingRecord(ctx, { id: RECORD, notes: 'unsaved' }))).rejects.toMatchObject({
				status: 500,
				body: { message: 'Internal server error' }
			});
			expect(await ctx.store.findMany('personnel_trainings', 'test-org')).toEqual(before);
			expect(ctx.audit.events).toEqual([]);
		} finally {
			vi.restoreAllMocks();
		}
	});
});

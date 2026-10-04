import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { completeDataExport, failDataExport, startDataExport, listDataExportRows } from './dataExportLifecycle.server';

describe('dataExportLifecycle use cases', () => {
	it('creates a processing export record through the app-owned store', async () => {
		const ctx = createTestContext();

		const record = await startDataExport({ auth: ctx.auth, store: ctx.rawStore }, { requestedBy: ctx.auth.userId });

		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('data_exports', ctx.auth.orgId, {
			id: record.exportId
		});

		expect(saved).toMatchObject({
			id: record.exportId,
			org_id: ctx.auth.orgId,
			requested_by: ctx.auth.userId,
			status: 'processing'
		});
	});

	it('marks an export as completed with a file size', async () => {
		const ctx = createTestContext();
		const record = await startDataExport({ auth: ctx.auth, store: ctx.rawStore }, { requestedBy: ctx.auth.userId });

		await completeDataExport(
			{ auth: ctx.auth, store: ctx.rawStore },
			{ exportId: record.exportId, fileSizeBytes: 2048 }
		);

		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('data_exports', ctx.auth.orgId, {
			id: record.exportId
		});

		expect(saved).toMatchObject({
			status: 'completed',
			file_size_bytes: 2048
		});
		expect(saved?.completed_at).toEqual(expect.any(String));
	});

	it('marks an export as failed when generation aborts', async () => {
		const ctx = createTestContext();
		const record = await startDataExport({ auth: ctx.auth, store: ctx.rawStore }, { requestedBy: ctx.auth.userId });

		await failDataExport({ auth: ctx.auth, store: ctx.rawStore }, { exportId: record.exportId });

		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('data_exports', ctx.auth.orgId, {
			id: record.exportId
		});

		expect(saved).toMatchObject({
			status: 'failed'
		});
		expect(saved?.completed_at).toEqual(expect.any(String));
	});
	it('exports saved lifecycle history for the bound Organization without dropping fields', async () => {
		const ctx = createTestContext();
		const completed = {
			id: 'saved-completed',
			org_id: ctx.auth.orgId,
			requested_by: 'former-admin',
			status: 'completed',
			file_size_bytes: 2048,
			created_at: '2026-09-01T01:02:03.123456Z',
			completed_at: '2026-09-01T01:02:05.654321Z'
		};
		const failed = {
			id: 'saved-failed',
			org_id: ctx.auth.orgId,
			requested_by: 'current-owner',
			status: 'failed',
			file_size_bytes: null,
			created_at: '2026-09-02T01:02:03.123456Z',
			completed_at: '2026-09-02T01:02:05.654321Z'
		};
		ctx.rawStore.seed('data_exports', [completed, failed, { ...completed, id: 'foreign-export', org_id: 'other-org' }]);
		expect(await listDataExportRows(ctx.rawStore, ctx.auth.orgId)).toEqual([completed, failed]);
	});
});

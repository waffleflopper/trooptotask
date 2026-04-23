import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { completeDataExport, failDataExport, startDataExport } from './dataExportLifecycle';

describe('dataExportLifecycle use cases', () => {
	it('creates a processing export record through the app-owned store', async () => {
		const ctx = createTestContext();

		const record = await startDataExport(
			{ auth: ctx.auth, store: ctx.rawStore },
			{ requestedBy: ctx.auth.userId ?? 'fallback-user' }
		);

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
		const record = await startDataExport(
			{ auth: ctx.auth, store: ctx.rawStore },
			{ requestedBy: ctx.auth.userId ?? 'fallback-user' }
		);

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
		const record = await startDataExport(
			{ auth: ctx.auth, store: ctx.rawStore },
			{ requestedBy: ctx.auth.userId ?? 'fallback-user' }
		);

		await failDataExport({ auth: ctx.auth, store: ctx.rawStore }, { exportId: record.exportId });

		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('data_exports', ctx.auth.orgId, {
			id: record.exportId
		});

		expect(saved).toMatchObject({
			status: 'failed'
		});
		expect(saved?.completed_at).toEqual(expect.any(String));
	});
});

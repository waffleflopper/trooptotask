import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestContext, createTestDataExportLifecycleWriter } from '$lib/server/adapters/inMemory';
import {
	executeOrganizationDataExport,
	type OrganizationDataExportArtifact
} from './organizationDataExportExecution.server';

afterEach(() => vi.restoreAllMocks());

function jsonArtifact(overrides: Partial<Extract<OrganizationDataExportArtifact, { kind: 'json' }>> = {}) {
	return {
		kind: 'json' as const,
		body: '{"ok":true}',
		filename: 'org-export-test-org-2026-05-25.json',
		fileSizeBytes: 11,
		...overrides
	};
}

function workbookArtifact(overrides: Partial<Extract<OrganizationDataExportArtifact, { kind: 'workbook' }>> = {}) {
	return {
		kind: 'workbook' as const,
		buffer: new ArrayBuffer(4),
		filename: 'org-export-test-org-2026-05-25.xlsx',
		fileSizeBytes: 4,
		...overrides
	};
}

function seedCompletedExports(ctx: ReturnType<typeof createTestContext>, count: number) {
	const now = new Date().toISOString();
	ctx.rawStore.seed(
		'data_exports',
		Array.from({ length: count }, (_, index) => ({
			id: `export-${index + 1}`,
			org_id: ctx.auth.orgId,
			created_at: now,
			status: 'completed'
		}))
	);
}

describe('executeOrganizationDataExport', () => {
	it('completes concurrent exports above former quotas without any plan or usage reads', async () => {
		const ctx = createTestContext();
		seedCompletedExports(ctx, 11);
		const originalRows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		const reads = ['findMany', 'findOne'] as const;
		const spies = reads.map((method) =>
			vi.spyOn(ctx.rawStore, method).mockRejectedValue(new Error('Export execution must not read plans or usage'))
		);
		const results = await Promise.all(
			['first', 'second'].map((name) =>
				executeOrganizationDataExport(ctx, {
					requestedByEmail: 'leader@example.com',
					auditAction: 'export.created',
					buildArtifact: async () => jsonArtifact({ filename: `${name}.json` })
				})
			)
		);
		spies.forEach((spy) => spy.mockRestore());
		expect(results.map((result) => result.artifact.filename)).toEqual(['first.json', 'second.json']);
		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(rows).toHaveLength(13);
		expect(rows).toEqual(expect.arrayContaining(originalRows));
		expect(rows.filter((row) => row.requested_by === ctx.auth.userId)).toEqual([
			expect.objectContaining({ status: 'completed', file_size_bytes: 11 }),
			expect.objectContaining({ status: 'completed', file_size_bytes: 11 })
		]);
		expect(ctx.auditPort.events).toHaveLength(2);
		expect(ctx.notificationPort.notifications).toHaveLength(2);
	});

	it('completes, audits, and notifies for a JSON artifact', async () => {
		const ctx = createTestContext();

		const result = await executeOrganizationDataExport(ctx, {
			requestedByEmail: 'leader@example.com',
			auditAction: 'export.created',
			buildArtifact: async () => jsonArtifact()
		});

		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(result).toEqual({ status: 'ready', artifact: jsonArtifact() });
		expect(rows).toEqual([
			expect.objectContaining({
				requested_by: ctx.auth.userId,
				status: 'completed',
				file_size_bytes: 11
			})
		]);
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'export.created',
				resourceType: 'data_export',
				resourceId: rows[0].id
			})
		]);
		expect(ctx.notificationPort.notifications).toEqual([
			expect.objectContaining({
				target: 'admins',
				orgId: ctx.auth.orgId,
				excludeUserId: ctx.auth.userId,
				notification: {
					type: 'bulk_data_exported',
					title: 'Data Exported',
					message: '"leader@example.com" exported organization data.'
				}
			})
		]);
	});

	it('completes, audits, and notifies for a workbook artifact', async () => {
		const ctx = createTestContext();
		const artifact = workbookArtifact();

		const result = await executeOrganizationDataExport(ctx, {
			requestedByEmail: undefined,
			auditAction: 'export.excel_created',
			buildArtifact: async () => artifact
		});

		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(result).toEqual({ status: 'ready', artifact });
		expect(rows).toEqual([
			expect.objectContaining({
				requested_by: ctx.auth.userId,
				status: 'completed',
				file_size_bytes: 4
			})
		]);
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'export.excel_created',
				resourceType: 'data_export',
				resourceId: rows[0].id
			})
		]);
		expect(ctx.notificationPort.notifications[0].notification.message).toBe('"A user" exported organization data.');
	});

	it('marks the lifecycle row failed and rethrows when artifact building fails', async () => {
		const ctx = createTestContext();
		const failure = new Error('workbook failed');

		await expect(
			executeOrganizationDataExport(ctx, {
				requestedByEmail: 'leader@example.com',
				auditAction: 'export.created',
				buildArtifact: async () => {
					throw failure;
				}
			})
		).rejects.toThrow(failure);

		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(rows).toEqual([
			expect.objectContaining({
				requested_by: ctx.auth.userId,
				status: 'failed'
			})
		]);
		expect(ctx.auditPort.events).toHaveLength(0);
		expect(ctx.notificationPort.notifications).toHaveLength(0);
	});
	it('does not build an artifact or emit effects when the processing record is rejected', async () => {
		const ctx = createTestContext();
		const failure = new Error('lifecycle insert rejected');
		vi.spyOn(ctx.exportLifecycle, 'createProcessing').mockRejectedValue(failure);
		const buildArtifact = vi.fn(async () => jsonArtifact());
		await expect(
			executeOrganizationDataExport(ctx, {
				requestedByEmail: undefined,
				auditAction: 'export.created',
				buildArtifact
			})
		).rejects.toBe(failure);
		expect(buildArtifact).not.toHaveBeenCalled();
		expect(await ctx.rawStore.findMany('data_exports', ctx.auth.orgId)).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it('returns the artifact and success effects when its completion update fails', async () => {
		const ctx = createTestContext();
		const artifact = workbookArtifact();
		vi.spyOn(ctx.exportLifecycle, 'markCompleted').mockRejectedValue(new Error('completion update denied'));
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		await expect(
			executeOrganizationDataExport(ctx, {
				requestedByEmail: undefined,
				auditAction: 'export.excel_created',
				buildArtifact: async () => artifact
			})
		).resolves.toEqual({ status: 'ready', artifact });
		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(rows).toEqual([expect.objectContaining({ status: 'processing', requested_by: ctx.auth.userId })]);
		expect(rows[0]).not.toHaveProperty('file_size_bytes');
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({ action: 'export.excel_created', resourceId: rows[0].id })
		]);
		expect(ctx.notificationPort.notifications).toEqual([
			expect.objectContaining({ target: 'admins', orgId: ctx.auth.orgId, excludeUserId: ctx.auth.userId })
		]);
	});

	it('retains the artifact error if marking its row failed also fails', async () => {
		const ctx = createTestContext();
		const failure = new Error('source unavailable');
		vi.spyOn(ctx.exportLifecycle, 'markFailed').mockRejectedValue(new Error('lifecycle update denied'));
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		await expect(
			executeOrganizationDataExport(ctx, {
				requestedByEmail: undefined,
				auditAction: 'export.created',
				buildArtifact: async () => {
					throw failure;
				}
			})
		).rejects.toBe(failure);
		expect(await ctx.rawStore.findMany('data_exports', ctx.auth.orgId)).toEqual([
			expect.objectContaining({ status: 'processing', requested_by: ctx.auth.userId })
		]);
		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it('withholds the artifact and marks failure when notification rejects after completion and audit', async () => {
		const ctx = createTestContext();
		const failure = new Error('admin notification failed');
		let rowAtNotification: Record<string, unknown> | undefined;
		let auditedResource: string | undefined;
		vi.spyOn(ctx.notifications, 'notifyAdmins').mockImplementation(async () => {
			rowAtNotification = {
				...(await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId))[0]
			};
			auditedResource = ctx.auditPort.events[0]?.resourceId;
			throw failure;
		});
		await expect(
			executeOrganizationDataExport(ctx, {
				requestedByEmail: undefined,
				auditAction: 'export.created',
				buildArtifact: async () => jsonArtifact()
			})
		).rejects.toBe(failure);
		expect(rowAtNotification).toMatchObject({ status: 'completed', file_size_bytes: 11 });
		expect(auditedResource).toBe(rowAtNotification?.id);
		expect(await ctx.rawStore.findMany('data_exports', ctx.auth.orgId)).toEqual([
			expect.objectContaining({ id: auditedResource, status: 'failed', file_size_bytes: 11 })
		]);
	});

	it('keeps concurrent requesters and Organizations independent in one persistence store', async () => {
		const first = createTestContext({ auth: { orgId: 'organization-a', userId: 'owner-a' } });
		const second = createTestContext({ auth: { orgId: 'organization-a', userId: 'admin-a' } });
		const third = createTestContext({ auth: { orgId: 'organization-b', userId: 'owner-b' } });
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const pending = [first, second, third].map((ctx, index) =>
			executeOrganizationDataExport(
				{
					auth: ctx.auth,
					exportLifecycle: createTestDataExportLifecycleWriter(first.rawStore, ctx.auth.orgId),
					audit: ctx.audit,
					notifications: ctx.notifications
				},
				{
					requestedByEmail: undefined,
					auditAction: 'export.created',
					buildArtifact: async () => {
						await gate;
						return jsonArtifact({ fileSizeBytes: index + 1 });
					}
				}
			)
		);
		release();
		await Promise.all(pending);
		const a = await first.rawStore.findMany<Record<string, unknown>>('data_exports', 'organization-a');
		const b = await first.rawStore.findMany<Record<string, unknown>>('data_exports', 'organization-b');
		expect(a).toEqual([
			expect.objectContaining({ requested_by: 'owner-a', status: 'completed', file_size_bytes: 1 }),
			expect.objectContaining({ requested_by: 'admin-a', status: 'completed', file_size_bytes: 2 })
		]);
		expect(b).toEqual([expect.objectContaining({ requested_by: 'owner-b', status: 'completed', file_size_bytes: 3 })]);
		expect(new Set([...a, ...b].map((row) => row.id)).size).toBe(3);
		for (const [ctx, rows, rowIndex] of [
			[first, a, 0],
			[second, a, 1],
			[third, b, 0]
		] as const) {
			expect(ctx.auditPort.events[0].resourceId).toBe(rows[rowIndex].id);
			expect(ctx.notificationPort.notifications[0]).toMatchObject({
				orgId: ctx.auth.orgId,
				excludeUserId: ctx.auth.userId
			});
		}
	});
});

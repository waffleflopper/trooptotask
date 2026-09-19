import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { executeOrganizationDataExport, type OrganizationDataExportArtifact } from './organizationDataExportExecution';

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
});

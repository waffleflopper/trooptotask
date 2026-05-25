import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { executeOrganizationDataExport, type OrganizationDataExportArtifact } from './organizationDataExportExecution';

const { billingEnabledMock } = vi.hoisted(() => ({
	billingEnabledMock: vi.fn(() => true)
}));

vi.mock('$lib/config/billing', () => ({
	get isBillingEnabled() {
		return billingEnabledMock();
	}
}));

afterEach(() => {
	billingEnabledMock.mockReturnValue(true);
	vi.restoreAllMocks();
});

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
	it('throws 403 without starting a lifecycle row when the authenticated user is missing', async () => {
		const ctx = createTestContext({ auth: { userId: null } });
		const buildArtifact = vi.fn(async () => jsonArtifact());

		await expect(
			executeOrganizationDataExport(ctx, {
				requestedByEmail: undefined,
				auditAction: 'export.created',
				buildArtifact
			})
		).rejects.toMatchObject({ status: 403 });

		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(rows).toHaveLength(0);
		expect(buildArtifact).not.toHaveBeenCalled();
	});

	it('returns rate_limited without starting a lifecycle row when pre-start quota denies', async () => {
		const ctx = createTestContext();
		seedCompletedExports(ctx, 3);
		const buildArtifact = vi.fn(async () => jsonArtifact());

		const result = await executeOrganizationDataExport(ctx, {
			requestedByEmail: 'leader@example.com',
			auditAction: 'export.created',
			buildArtifact
		});

		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(result).toMatchObject({
			status: 'rate_limited',
			error: 'Export limit reached (3/month). Upgrade for unlimited exports.'
		});
		expect(rows).toHaveLength(3);
		expect(buildArtifact).not.toHaveBeenCalled();
		expect(ctx.auditPort.events).toHaveLength(0);
		expect(ctx.notificationPort.notifications).toHaveLength(0);
	});

	it('marks the started lifecycle row failed when post-start quota denies', async () => {
		const ctx = createTestContext();
		seedCompletedExports(ctx, 2);
		const originalInsert = ctx.rawStore.insert.bind(ctx.rawStore);
		let injectedConcurrentExport = false;
		ctx.rawStore.insert = async (table, orgId, data, select) => {
			if (table === 'data_exports' && !injectedConcurrentExport) {
				injectedConcurrentExport = true;
				await originalInsert(table, orgId, {
					requested_by: 'other-user',
					status: 'completed',
					created_at: new Date().toISOString()
				});
			}
			return originalInsert(table, orgId, data, select);
		};
		const buildArtifact = vi.fn(async () => jsonArtifact());

		const result = await executeOrganizationDataExport(ctx, {
			requestedByEmail: 'leader@example.com',
			auditAction: 'export.created',
			buildArtifact
		});

		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(result).toMatchObject({
			status: 'rate_limited',
			error: 'Export limit reached (3/month). Upgrade for unlimited exports.'
		});
		expect(rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ requested_by: 'other-user', status: 'completed' }),
				expect.objectContaining({ requested_by: ctx.auth.userId, status: 'failed' })
			])
		);
		expect(buildArtifact).not.toHaveBeenCalled();
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

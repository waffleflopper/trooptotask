import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort,
	createTestNotificationPort
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { fetchAuditLogs } from './auditLogQuery';

const ORG = 'test-org';

function buildCtx(overrides?: { auth?: Parameters<typeof createTestAuthContext>[0] }): UseCaseContext {
	const store = createInMemoryDataStore();
	return {
		store,
		rawStore: store,
		auth: createTestAuthContext({ orgId: ORG, role: 'admin', isPrivileged: true, ...overrides?.auth }),
		audit: createTestAuditPort(),
		readOnlyGuard: createTestReadOnlyGuard(),
		subscription: createTestSubscriptionPort(),
		notifications: createTestNotificationPort()
	};
}

describe('fetchAuditLogs', () => {
	it('returns audit logs from adminStore scoped to orgId', async () => {
		const ctx = buildCtx();
		const adminStore = createInMemoryDataStore();

		adminStore.seed('audit_logs', [
			{
				id: 'log1',
				organization_id: ORG,
				org_id: ORG,
				user_id: 'u1',
				action: 'personnel.create',
				resource_type: 'personnel',
				resource_id: 'p1',
				details: null,
				timestamp: '2026-03-23T10:00:00Z'
			}
		]);

		const result = await fetchAuditLogs(ctx, adminStore, { page: 1 });

		expect(result.logs).toHaveLength(1);
		expect(result.logs[0].action).toBe('personnel.create');
		expect(result.totalCount).toBe(1);
	});

	it('excludes site-wide auth actions', async () => {
		const ctx = buildCtx();
		const adminStore = createInMemoryDataStore();

		adminStore.seed('audit_logs', [
			{
				id: 'log1',
				organization_id: ORG,
				org_id: ORG,
				user_id: 'u1',
				action: 'auth.login_success',
				resource_type: null,
				resource_id: null,
				details: null,
				timestamp: '2026-03-23T10:00:00Z'
			},
			{
				id: 'log2',
				organization_id: ORG,
				org_id: ORG,
				user_id: 'u1',
				action: 'personnel.create',
				resource_type: 'personnel',
				resource_id: 'p1',
				details: null,
				timestamp: '2026-03-23T10:01:00Z'
			}
		]);

		const result = await fetchAuditLogs(ctx, adminStore, { page: 1 });

		expect(result.logs).toHaveLength(1);
		expect(result.logs[0].action).toBe('personnel.create');
	});

	it('filters by action when provided', async () => {
		const ctx = buildCtx();
		const adminStore = createInMemoryDataStore();

		adminStore.seed('audit_logs', [
			{
				id: 'log1',
				organization_id: ORG,
				org_id: ORG,
				user_id: 'u1',
				action: 'personnel.create',
				resource_type: 'personnel',
				resource_id: 'p1',
				details: null,
				timestamp: '2026-03-23T10:00:00Z'
			},
			{
				id: 'log2',
				organization_id: ORG,
				org_id: ORG,
				user_id: 'u1',
				action: 'personnel.delete',
				resource_type: 'personnel',
				resource_id: 'p2',
				details: null,
				timestamp: '2026-03-23T10:01:00Z'
			}
		]);

		const result = await fetchAuditLogs(ctx, adminStore, { page: 1, action: 'personnel.create' });

		expect(result.logs).toHaveLength(1);
		expect(result.logs[0].action).toBe('personnel.create');
	});

	it('returns available actions for filter dropdown', async () => {
		const ctx = buildCtx();
		const adminStore = createInMemoryDataStore();

		adminStore.seed('audit_logs', [
			{
				id: 'log1',
				organization_id: ORG,
				org_id: ORG,
				user_id: 'u1',
				action: 'personnel.create',
				resource_type: 'personnel',
				resource_id: 'p1',
				details: null,
				timestamp: '2026-03-23T10:00:00Z'
			},
			{
				id: 'log2',
				organization_id: ORG,
				org_id: ORG,
				user_id: 'u1',
				action: 'personnel.delete',
				resource_type: 'personnel',
				resource_id: 'p2',
				details: null,
				timestamp: '2026-03-23T10:01:00Z'
			}
		]);

		const result = await fetchAuditLogs(ctx, adminStore, { page: 1 });

		expect(result.availableActions).toContain('personnel.create');
		expect(result.availableActions).toContain('personnel.delete');
	});
});

import { describe, it, expect, vi } from 'vitest';
import { createInMemoryDataStore, createQueryPortsContext } from '$lib/server/adapters/inMemory';
import { fetchAuditLogPreview, fetchAuditLogs } from './auditLogQuery';

const ORG = 'test-org';

describe('fetchAuditLogs', () => {
	it('returns audit logs from adminStore scoped to orgId', async () => {
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();

		adminStore.seed('organization_memberships', [
			{ id: 'm1', organization_id: ORG, user_id: 'u1', email: 'alice@example.com' }
		]);

		adminStore.seed('audit_logs', [
			{
				id: 'log1',
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
		expect(result.logs[0].actor).toBe('alice@example.com');
		expect(result.totalCount).toBe(1);
	});

	it('excludes site-wide auth actions', async () => {
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();

		adminStore.seed('audit_logs', [
			{
				id: 'log1',
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
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();

		adminStore.seed('audit_logs', [
			{
				id: 'log1',
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
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();

		adminStore.seed('audit_logs', [
			{
				id: 'log1',
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

	it('prefers actor from details when present', async () => {
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();

		adminStore.seed('organization_memberships', [
			{ id: 'm1', organization_id: ORG, user_id: 'u1', email: 'alice@example.com' }
		]);

		adminStore.seed('audit_logs', [
			{
				id: 'log1',
				org_id: ORG,
				user_id: 'u1',
				action: 'personnel.create',
				resource_type: 'personnel',
				resource_id: 'p1',
				details: { actor: 'override@example.com' },
				timestamp: '2026-03-23T10:00:00Z'
			}
		]);

		const result = await fetchAuditLogs(ctx, adminStore, { page: 1 });

		expect(result.logs[0].actor).toBe('override@example.com');
	});
});

describe('fetchAuditLogPreview', () => {
	it('returns a bounded settings rail preview without hydrating filter actions', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-27T12:00:00Z'));
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();
		const originalFindMany = adminStore.findMany.bind(adminStore);
		let auditLogFindOptions: Parameters<typeof originalFindMany>[3] | undefined;

		adminStore.findMany = (async (...args: Parameters<typeof originalFindMany>) => {
			if (args[0] === 'audit_logs') auditLogFindOptions = args[3];
			return originalFindMany(...args);
		}) as typeof adminStore.findMany;

		adminStore.seed('audit_logs', [
			{
				id: 'auth-log',
				org_id: ORG,
				user_id: 'u1',
				action: 'auth.login_success',
				resource_type: null,
				resource_id: null,
				details: null,
				timestamp: '2026-04-27T11:59:00Z'
			},
			...Array.from({ length: 10 }, (_, index) => ({
				id: `log-${index}`,
				org_id: ORG,
				user_id: 'u1',
				action: `settings.change.${index}`,
				resource_type: 'organization',
				resource_id: ORG,
				details: null,
				timestamp: `2026-04-27T11:${String(50 - index).padStart(2, '0')}:00Z`
			})),
			{
				id: 'older-log',
				org_id: ORG,
				user_id: 'u1',
				action: 'organization.rename',
				resource_type: 'organization',
				resource_id: ORG,
				details: null,
				timestamp: '2026-03-01T10:00:00Z'
			}
		]);

		const result = await fetchAuditLogPreview(ctx, adminStore, { limit: 9 });

		expect(result.logs).toHaveLength(9);
		expect(result.logs.map((log) => log.id)).not.toContain('auth-log');
		expect(result.totalCount).toBe(11);
		expect(result.last30DaysCount).toBe(10);
		expect(result.availableActions).toEqual([]);
		expect(auditLogFindOptions).toMatchObject({
			limit: 9,
			notInFilters: { action: expect.arrayContaining(['auth.login_success']) },
			select: 'id, user_id, action, resource_type, resource_id, details, timestamp'
		});

		vi.useRealTimers();
	});
});

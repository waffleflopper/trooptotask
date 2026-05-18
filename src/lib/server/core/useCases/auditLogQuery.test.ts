import { describe, it, expect, vi } from 'vitest';
import { createInMemoryDataStore, createQueryPortsContext } from '$lib/server/adapters/inMemory';
import { fetchAuditLogPreview, fetchAuditLogs } from './auditLogQuery';

const ORG = 'test-org';

describe('fetchAuditLogs', () => {
	function auditLog(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
		return {
			id: 'log',
			org_id: ORG,
			user_id: 'u1',
			action: 'personnel.create',
			resource_type: 'personnel',
			resource_id: 'p1',
			details: null,
			timestamp: '2026-03-23T10:00:00Z',
			...overrides
		};
	}

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

	it('paginates rows at the data-store boundary without hydrating all audit rows', async () => {
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();
		const originalFindMany = adminStore.findMany.bind(adminStore);
		const originalFindManyWithCount = adminStore.findManyWithCount.bind(adminStore);
		const findManyWithCountAuditOptions: Parameters<typeof originalFindManyWithCount>[3][] = [];

		adminStore.findMany = (async (...args: Parameters<typeof originalFindMany>) => {
			if (args[0] === 'audit_logs') throw new Error('fetchAuditLogs should not load audit rows through findMany');
			return originalFindMany(...args);
		}) as typeof adminStore.findMany;
		adminStore.findManyWithCount = (async (...args: Parameters<typeof originalFindManyWithCount>) => {
			if (args[0] === 'audit_logs') findManyWithCountAuditOptions.push(args[3]);
			return originalFindManyWithCount(...args);
		}) as typeof adminStore.findManyWithCount;

		adminStore.seed(
			'audit_logs',
			Array.from({ length: 6 }, (_, index) =>
				auditLog({
					id: `log-${index}`,
					action: index % 2 === 0 ? 'personnel.create' : 'training.update',
					timestamp: `2026-03-23T10:0${index}:00Z`
				})
			)
		);

		const result = await fetchAuditLogs(ctx, adminStore, { page: 2, limit: 2 });

		expect(result.logs.map((log) => log.id)).toEqual(['log-3', 'log-2']);
		expect(result.totalCount).toBe(6);
		expect(findManyWithCountAuditOptions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					range: { from: 2, to: 3 },
					notInFilters: { action: expect.arrayContaining(['auth.login_success']) },
					select: 'id, user_id, action, resource_type, resource_id, details, timestamp'
				})
			])
		);
	});

	it('clamps invalid page numbers before requesting a data-store range', async () => {
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();
		const originalFindManyWithCount = adminStore.findManyWithCount.bind(adminStore);
		const findManyWithCountAuditOptions: Parameters<typeof originalFindManyWithCount>[3][] = [];

		adminStore.findManyWithCount = (async (...args: Parameters<typeof originalFindManyWithCount>) => {
			if (args[0] === 'audit_logs') findManyWithCountAuditOptions.push(args[3]);
			return originalFindManyWithCount(...args);
		}) as typeof adminStore.findManyWithCount;

		adminStore.seed('audit_logs', [
			auditLog({ id: 'log-1', action: 'personnel.create', timestamp: '2026-03-23T10:00:00Z' })
		]);

		const result = await fetchAuditLogs(ctx, adminStore, { page: 0, limit: 50 });

		expect(result.page).toBe(1);
		expect(findManyWithCountAuditOptions).toEqual(
			expect.arrayContaining([expect.objectContaining({ range: { from: 0, to: 49 } })])
		);
	});

	it('counts the selected action in the database and keeps available actions unfiltered', async () => {
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();
		const originalFindManyWithCount = adminStore.findManyWithCount.bind(adminStore);
		const countCalls: Parameters<typeof originalFindManyWithCount>[] = [];

		adminStore.findManyWithCount = (async (...args: Parameters<typeof originalFindManyWithCount>) => {
			if (args[0] === 'audit_logs') countCalls.push(args);
			return originalFindManyWithCount(...args);
		}) as typeof adminStore.findManyWithCount;

		adminStore.seed('audit_logs', [
			auditLog({ id: 'log-1', action: 'personnel.create', timestamp: '2026-03-23T10:00:00Z' }),
			auditLog({ id: 'log-2', action: 'personnel.create', timestamp: '2026-03-23T10:01:00Z' }),
			auditLog({ id: 'log-3', action: 'training.update', timestamp: '2026-03-23T10:02:00Z' })
		]);

		const result = await fetchAuditLogs(ctx, adminStore, {
			page: 1,
			limit: 10,
			action: 'personnel.create'
		});

		expect(result.logs.map((log) => log.id)).toEqual(['log-2', 'log-1']);
		expect(result.totalCount).toBe(2);
		expect(result.actionFilter).toBe('personnel.create');
		expect(result.availableActions).toEqual(['personnel.create', 'training.update']);
		expect(countCalls).toEqual(
			expect.arrayContaining([
				expect.arrayContaining([
					'audit_logs',
					ORG,
					{ action: 'personnel.create' },
					expect.objectContaining({ count: 'exact' })
				])
			])
		);
	});

	it('computes last-30-days count with excluded actions and without selected action filtering', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-27T12:00:00Z'));
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();

		adminStore.seed('audit_logs', [
			auditLog({ id: 'recent-create', action: 'personnel.create', timestamp: '2026-04-20T10:00:00Z' }),
			auditLog({ id: 'recent-training', action: 'training.update', timestamp: '2026-04-19T10:00:00Z' }),
			auditLog({ id: 'recent-auth', action: 'auth.login_success', timestamp: '2026-04-18T10:00:00Z' }),
			auditLog({ id: 'older-create', action: 'personnel.create', timestamp: '2026-03-01T10:00:00Z' })
		]);

		const result = await fetchAuditLogs(ctx, adminStore, {
			page: 1,
			limit: 10,
			action: 'personnel.create'
		});

		expect(result.logs.map((log) => log.id)).toEqual(['recent-create', 'older-create']);
		expect(result.totalCount).toBe(2);
		expect(result.last30DaysCount).toBe(2);
		expect(result.availableActions).toEqual(['personnel.create', 'training.update']);

		vi.useRealTimers();
	});

	it('does not leak logs from other organizations through the paged path', async () => {
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();

		adminStore.seed('audit_logs', [
			auditLog({ id: 'org-log', org_id: ORG, action: 'personnel.create', timestamp: '2026-03-23T10:00:00Z' }),
			auditLog({
				id: 'other-org-log',
				org_id: 'other-org',
				action: 'personnel.delete',
				timestamp: '2026-03-23T10:01:00Z'
			})
		]);

		const result = await fetchAuditLogs(ctx, adminStore, { page: 1, limit: 10 });

		expect(result.logs.map((log) => log.id)).toEqual(['org-log']);
		expect(result.totalCount).toBe(1);
		expect(result.availableActions).toEqual(['personnel.create']);
	});

	it('returns an empty selected page when the action filter is excluded', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-27T12:00:00Z'));
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();

		adminStore.seed('audit_logs', [
			auditLog({ id: 'auth-log', action: 'auth.login_success', timestamp: '2026-04-20T10:00:00Z' }),
			auditLog({ id: 'normal-log', action: 'personnel.create', timestamp: '2026-04-19T10:00:00Z' })
		]);

		const result = await fetchAuditLogs(ctx, adminStore, {
			page: 1,
			limit: 10,
			action: 'auth.login_success'
		});

		expect(result.logs).toEqual([]);
		expect(result.totalCount).toBe(0);
		expect(result.last30DaysCount).toBe(1);
		expect(result.availableActions).toEqual(['personnel.create']);

		vi.useRealTimers();
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

	it('does not use the limited preview rows as the total-count fallback', async () => {
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();
		const originalFindManyWithCount = adminStore.findManyWithCount.bind(adminStore);

		adminStore.findManyWithCount = (async (...args: Parameters<typeof originalFindManyWithCount>) => {
			const result = await originalFindManyWithCount(...args);
			return { ...result, count: null };
		}) as typeof adminStore.findManyWithCount;

		adminStore.seed('audit_logs', [
			{
				id: 'log-1',
				org_id: ORG,
				user_id: 'u1',
				action: 'organization.rename',
				resource_type: 'organization',
				resource_id: ORG,
				details: null,
				timestamp: '2026-04-27T11:59:00Z'
			},
			{
				id: 'log-2',
				org_id: ORG,
				user_id: 'u1',
				action: 'organization.policy_update',
				resource_type: 'organization',
				resource_id: ORG,
				details: null,
				timestamp: '2026-04-27T11:58:00Z'
			}
		]);

		const result = await fetchAuditLogPreview(ctx, adminStore, { limit: 2 });

		expect(result.logs).toHaveLength(2);
		expect(result.totalCount).toBe(0);
		expect(result.last30DaysCount).toBe(0);
	});
});

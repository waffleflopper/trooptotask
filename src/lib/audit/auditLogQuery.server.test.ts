import { describe, it, expect, vi } from 'vitest';
import { createInMemoryDataStore, createQueryPortsContext } from '$lib/server/adapters/inMemory';
import { fetchAuditLogs as queryAuditLogs, fetchLatestAuditEvent, type AuditLabelReads } from './auditLogQuery.server';
import type { AuditLogQueryInput } from './contracts';
import { createInMemoryOrganizationAuditStore } from './inMemoryOrganizationAudit';

function labelReads(store: ReturnType<typeof createInMemoryDataStore>, orgId: string): AuditLabelReads {
	const names = async (table: string, ids: string[]) => {
		if (!ids.length) return new Map<string, string>();
		const rows = await store.findMany<Record<string, unknown>>(table, orgId, undefined, { inFilters: { id: ids } });
		return new Map(
			rows.map((row) => [
				String(row.id),
				row.rank !== undefined && row.last_name !== undefined
					? [row.rank, row.last_name, row.first_name].filter(Boolean).join(' ')
					: String(row.name ?? row.id)
			])
		);
	};
	return {
		personnelNames: (ids) => names('personnel', ids),
		trainingTypeNames: (ids) => names('training_types', ids),
		statusTypeNames: (ids) => names('status_types', ids),
		actorEmails: async (ids) => {
			if (!ids.length) return new Map<string, string>();
			const rows = await store.findMany<{ user_id: string; email: string }>(
				'organization_memberships',
				orgId,
				undefined,
				{ inFilters: { user_id: ids } }
			);
			return new Map(
				rows
					.filter((row) => typeof row.email === 'string' && row.email.length > 0)
					.map((row) => [row.user_id, row.email])
			);
		}
	};
}

function fetchAuditLogs(
	ctx: ReturnType<typeof createQueryPortsContext>,
	store: ReturnType<typeof createInMemoryDataStore>,
	input: AuditLogQueryInput
) {
	const orgId = ctx.auth.orgId;
	return queryAuditLogs(orgId, createInMemoryOrganizationAuditStore(store), input, labelReads(store, orgId));
}

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

	it('enriches same-Organization labels while preserving safe and masked stored details', async () => {
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();
		const personnelId = '11111111-1111-4111-8111-111111111111';
		const trainingTypeId = '22222222-2222-4222-8222-222222222222';
		const statusTypeId = '33333333-3333-4333-8333-333333333333';

		adminStore.seed('personnel', [
			{ id: personnelId, organization_id: ORG, rank: 'SPC', last_name: 'Vale', first_name: 'Rowan' }
		]);
		adminStore.seed('training_types', [{ id: trainingTypeId, organization_id: ORG, name: 'Combat lifesaver' }]);
		adminStore.seed('status_types', [{ id: statusTypeId, organization_id: ORG, name: 'Available' }]);
		adminStore.seed('organization_memberships', [
			{ id: 'm1', organization_id: ORG, user_id: 'u1', email: 'same-org@example.com' },
			{ id: 'm2', organization_id: 'other-org', user_id: 'u1', email: 'other-org@example.com' }
		]);
		adminStore.seed('audit_logs', [
			auditLog({
				details: {
					personnel_id: personnelId,
					training_type_id: trainingTypeId,
					status_type_id: statusTypeId,
					date: '2026-03-23',
					email: 'r***@example.com',
					notes: '[redacted]',
					redacted_fields: ['notes'],
					completed: true,
					count: 2,
					previous_value: null
				}
			})
		]);

		const result = await fetchAuditLogs(ctx, adminStore, { page: 1 });

		expect(result.logs[0].actor).toBe('same-org@example.com');
		expect(result.logs[0].details).toEqual({
			personnel: 'SPC Vale Rowan',
			training_type: 'Combat lifesaver',
			status_type: 'Available',
			date: '2026-03-23',
			email: 'r***@example.com',
			notes: '[redacted]',
			redacted_fields: ['notes'],
			completed: true,
			count: 2,
			previous_value: null
		});
	});

	it('returns the requested newest-first page with the full matching count', async () => {
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();

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
	});

	it('treats a page below one as the first page', async () => {
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();

		adminStore.seed('audit_logs', [
			auditLog({ id: 'log-1', action: 'personnel.create', timestamp: '2026-03-23T10:00:00Z' })
		]);

		const result = await fetchAuditLogs(ctx, adminStore, { page: 0, limit: 50 });

		expect(result.page).toBe(1);
		expect(result.logs.map((log) => log.id)).toEqual(['log-1']);
	});

	it('counts the selected action in the database and keeps available actions unfiltered', async () => {
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();

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

describe('Audit disclosure and incomplete counts', () => {
	it('conceals foreign labels and membership emails while stripping unresolved detail UUIDs', async () => {
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();
		const personnelId = '44444444-4444-4444-8444-444444444444';
		const trainingTypeId = '55555555-5555-4555-8555-555555555555';
		const statusTypeId = '66666666-6666-4666-8666-666666666666';
		const resourceId = '77777777-7777-4777-8777-777777777777';

		adminStore.seed('personnel', [
			{ id: personnelId, organization_id: 'other-org', rank: 'SFC', last_name: 'Foreign', first_name: 'Person' }
		]);
		adminStore.seed('training_types', [{ id: trainingTypeId, organization_id: 'other-org', name: 'Foreign training' }]);
		adminStore.seed('status_types', [{ id: statusTypeId, organization_id: 'other-org', name: 'Foreign status' }]);
		adminStore.seed('organization_memberships', [
			{ id: 'foreign-membership', organization_id: 'other-org', user_id: 'u2', email: 'foreign@example.com' }
		]);
		adminStore.seed('audit_logs', [
			{
				id: 'org-log',
				org_id: ORG,
				user_id: 'u2',
				action: 'training.update',
				resource_type: 'training_record',
				resource_id: resourceId,
				details: {
					personnel_id: personnelId,
					training_type_id: trainingTypeId,
					status_type_id: statusTypeId,
					legacy_link_id: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
					subject_label: 'Historical subject',
					actor_identifier: 'f***@example.com'
				},
				timestamp: '2026-03-23T10:00:00Z'
			},
			{
				id: 'foreign-log',
				org_id: 'other-org',
				user_id: 'u2',
				action: 'training.update',
				details: { subject_label: 'Foreign audit subject' },
				timestamp: '2026-03-23T10:01:00Z'
			}
		]);

		const result = await fetchAuditLogs(ctx, adminStore, { page: 1, limit: 2 });

		expect(result.logs).toEqual([
			expect.objectContaining({
				id: 'org-log',
				actor: null,
				resourceId,
				details: { subject_label: 'Historical subject', actor_identifier: 'f***@example.com' }
			})
		]);
		expect(result.totalCount).toBe(1);
	});

	it('does not report the loaded rows as a missing database count', async () => {
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

		const result = await fetchAuditLogs(ctx, adminStore, { page: 1, limit: 2 });

		expect(result.logs).toHaveLength(2);
		expect(result.totalCount).toBe(0);
		expect(result.last30DaysCount).toBe(0);
	});
});

describe('fetchLatestAuditEvent', () => {
	const latestRename = (store: ReturnType<typeof createInMemoryDataStore>) =>
		fetchLatestAuditEvent(ORG, createInMemoryOrganizationAuditStore(store), 'org.renamed', labelReads(store, ORG));

	it('returns the newest entry for the action with its actor', async () => {
		const store = createInMemoryDataStore();
		store.seed('organization_memberships', [
			{ id: 'm1', organization_id: ORG, user_id: 'u1', email: 'first@example.com' },
			{ id: 'm2', organization_id: ORG, user_id: 'u2', email: 'second@example.com' }
		]);
		store.seed('audit_logs', [
			{
				id: 'a',
				org_id: ORG,
				user_id: 'u1',
				action: 'org.renamed',
				details: { name: 'Alpha' },
				timestamp: '2026-03-01T10:00:00Z'
			},
			{
				id: 'b',
				org_id: ORG,
				user_id: 'u2',
				action: 'org.renamed',
				details: { name: 'Bravo' },
				timestamp: '2026-03-14T10:00:00Z'
			},
			{
				id: 'c',
				org_id: ORG,
				user_id: 'u1',
				action: 'org.url_slug_updated',
				details: null,
				timestamp: '2026-03-20T10:00:00Z'
			},
			{
				id: 'd',
				org_id: 'other-org',
				user_id: 'u1',
				action: 'org.renamed',
				details: null,
				timestamp: '2026-04-01T10:00:00Z'
			}
		]);

		const entry = await latestRename(store);

		expect(entry).toMatchObject({ id: 'b', actor: 'second@example.com', createdAt: '2026-03-14T10:00:00Z' });
	});

	it('returns null when no entry for the action remains', async () => {
		const store = createInMemoryDataStore();
		store.seed('audit_logs', [
			{
				id: 'c',
				org_id: ORG,
				user_id: 'u1',
				action: 'org.url_slug_updated',
				details: null,
				timestamp: '2026-03-20T10:00:00Z'
			}
		]);

		expect(await latestRename(store)).toBeNull();
	});
});

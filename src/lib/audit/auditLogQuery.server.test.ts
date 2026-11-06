import { describe, it, expect } from 'vitest';
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
	input: Partial<AuditLogQueryInput> = {}
) {
	const orgId = ctx.auth.orgId;
	return queryAuditLogs(
		orgId,
		createInMemoryOrganizationAuditStore(store),
		{ filters: {}, timeZone: 'UTC', ...input },
		labelReads(store, orgId)
	);
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

		const result = await fetchAuditLogs(ctx, adminStore, {});

		expect(result.logs).toHaveLength(1);
		expect(result.logs[0].action).toBe('personnel.create');
		expect(result.logs[0].actor).toBe('alice@example.com');
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
			},
			{
				id: 'log3',
				org_id: ORG,
				user_id: null,
				action: 'security.rate_limit_exceeded',
				resource_type: 'request',
				resource_id: null,
				details: null,
				timestamp: '2026-03-23T10:02:00Z'
			}
		]);

		const result = await fetchAuditLogs(ctx, adminStore, {});

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

		const result = await fetchAuditLogs(ctx, adminStore, { filters: { kind: 'personnel.create' } });

		expect(result.logs).toHaveLength(1);
		expect(result.logs[0].action).toBe('personnel.create');
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

		const result = await fetchAuditLogs(ctx, adminStore, {});

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

		const result = await fetchAuditLogs(ctx, adminStore, {});

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

	it('reads an entry by its saved labels after the person is renamed and the member changes email', async () => {
		const ctx = createQueryPortsContext();
		const adminStore = createInMemoryDataStore();
		const personnelId = '11111111-1111-4111-8111-111111111111';
		adminStore.seed('personnel', [
			{ id: personnelId, organization_id: ORG, rank: 'SGT', last_name: 'Renamed', first_name: 'Later' }
		]);
		adminStore.seed('organization_memberships', [
			{ id: 'm1', organization_id: ORG, user_id: 'u1', email: 'current@example.com' }
		]);
		const details = { startDate: '2026-11-10', endDate: '2026-11-20', personnel_id: personnelId };
		adminStore.seed('audit_logs', [
			auditLog({
				action: 'availability.created',
				actor_label: 'SSG Rivera, Sam',
				record_label: 'Leave',
				subject_personnel_id: personnelId,
				subject_label: 'SPC Doe, Jane',
				batch_id: 'batch-1',
				details
			}),
			auditLog({ id: 'legacy', details: { personnel_id: personnelId } })
		]);

		const { logs } = await fetchAuditLogs(ctx, adminStore, {});

		expect(logs.find((log) => log.id === 'log')).toMatchObject({
			actor: 'SSG Rivera, Sam',
			recordLabel: 'Leave',
			subject: { personnelId, label: 'SPC Doe, Jane' },
			batchId: 'batch-1',
			details
		});
		expect(logs.find((log) => log.id === 'legacy')).toMatchObject({
			actor: 'current@example.com',
			recordLabel: null,
			subject: null,
			batchId: null,
			details: { personnel: 'SGT Renamed Later' }
		});
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

		const result = await fetchAuditLogs(ctx, adminStore, { limit: 10 });

		expect(result.logs.map((log) => log.id)).toEqual(['org-log']);
	});
});

describe('fetchAuditLogs filters and paging', () => {
	const PERSON = '11111111-1111-4111-8111-111111111111';
	const MEMBER = '22222222-2222-4222-8222-222222222222';

	const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

	function entry(id: string, timestamp: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
		return {
			id,
			org_id: ORG,
			user_id: 'busy-member',
			action: 'training_record.updated',
			resource_type: 'training_record',
			resource_id: null,
			details: null,
			subject_personnel_id: 'busy-person',
			timestamp,
			...overrides
		};
	}

	function seedWithOldEntry() {
		const store = createInMemoryDataStore();
		const recent = Array.from({ length: 250 }, (_, index) =>
			entry(`recent-${String(index).padStart(3, '0')}`, new Date(Date.UTC(2026, 5, 1, 0, index)).toISOString())
		);
		store.seed('audit_logs', [
			...recent,
			entry('old', '2026-01-10T09:00:00Z', {
				user_id: MEMBER,
				action: 'availability.deleted',
				subject_personnel_id: PERSON
			})
		]);
		return store;
	}

	it('finds an entry older than the newest 100 by person, member, kind and day range', async () => {
		const store = seedWithOldEntry();
		const ctx = createQueryPortsContext();

		const newest = await fetchAuditLogs(ctx, store, { limit: 100 });
		expect(newest.logs.map((log) => log.id)).not.toContain('old');

		for (const filters of [
			{ personId: PERSON },
			{ userId: MEMBER },
			{ kind: 'availability.deleted' },
			{ from: '2026-01-10', to: '2026-01-10' }
		]) {
			const found = await fetchAuditLogs(ctx, store, { filters, limit: 100 });
			expect(found.logs.map((log) => log.id)).toEqual(['old']);
			expect(found.nextCursor).toBeNull();
		}
	});

	it('combines filters', async () => {
		const store = seedWithOldEntry();
		const ctx = createQueryPortsContext();

		const matching = await fetchAuditLogs(ctx, store, {
			filters: { personId: PERSON, userId: MEMBER, kind: 'availability.deleted', from: '2026-01-01', to: '2026-01-31' }
		});
		const wrongMember = await fetchAuditLogs(ctx, store, { filters: { personId: PERSON, userId: 'busy-member' } });

		expect(matching.logs.map((log) => log.id)).toEqual(['old']);
		expect(wrongMember.logs).toEqual([]);
	});

	it('reads a day range as whole days in the viewer time zone, both ends included', async () => {
		const store = createInMemoryDataStore();
		store.seed('audit_logs', [
			entry('before', '2026-03-23T03:59:59Z'),
			entry('first', '2026-03-23T04:00:00Z'),
			entry('last', '2026-03-24T03:59:59Z'),
			entry('after', '2026-03-24T04:00:00Z')
		]);

		const result = await fetchAuditLogs(createQueryPortsContext(), store, {
			filters: { from: '2026-03-23', to: '2026-03-23' },
			timeZone: 'America/New_York'
		});

		expect(result.logs.map((log) => log.id)).toEqual(['last', 'first']);
	});

	it('returns every entry exactly once across pages, including entries that share a timestamp', async () => {
		const store = createInMemoryDataStore();
		const rows = Array.from({ length: 23 }, (_, index) =>
			entry(uuid(index), `2026-03-23T10:0${Math.floor(index / 5)}:00Z`)
		);
		store.seed('audit_logs', rows);
		const ctx = createQueryPortsContext();

		const walked: string[] = [];
		let after: string | undefined;
		let pages = 0;
		do {
			const page = await fetchAuditLogs(ctx, store, { limit: 4, after });
			walked.push(...page.logs.map((log) => log.id));
			after = page.nextCursor ?? undefined;
			pages += 1;
		} while (after);

		const expected = [...rows]
			.sort(
				(a, b) => String(b.timestamp).localeCompare(String(a.timestamp)) || String(b.id).localeCompare(String(a.id))
			)
			.map((row) => row.id);
		expect(walked).toEqual(expected);
		expect(pages).toBe(6);
	});

	it('continues a filtered list from its cursor', async () => {
		const store = createInMemoryDataStore();
		store.seed(
			'audit_logs',
			Array.from({ length: 7 }, (_, index) =>
				entry(uuid(index), `2026-03-23T10:0${index}:00Z`, { user_id: index % 2 === 0 ? MEMBER : 'busy-member' })
			)
		);
		const ctx = createQueryPortsContext();

		const first = await fetchAuditLogs(ctx, store, { filters: { userId: MEMBER }, limit: 2 });
		const second = await fetchAuditLogs(ctx, store, {
			filters: { userId: MEMBER },
			limit: 2,
			after: first.nextCursor!
		});

		expect(first.logs.map((log) => log.id)).toEqual([uuid(6), uuid(4)]);
		expect(second.logs.map((log) => log.id)).toEqual([uuid(2), uuid(0)]);
		expect(second.nextCursor).toBeNull();
	});

	it('refuses a cursor that no page returned', async () => {
		const store = createInMemoryDataStore();

		await expect(
			fetchAuditLogs(createQueryPortsContext(), store, { after: "x'); drop table audit_logs;--" })
		).rejects.toThrow('Invalid audit log cursor');
	});

	it('does not offer an excluded kind even when it is asked for', async () => {
		const store = createInMemoryDataStore();
		store.seed('audit_logs', [
			entry('login', '2026-04-20T10:00:00Z', { action: 'auth.login_success' }),
			entry('normal', '2026-04-19T10:00:00Z')
		]);

		const result = await fetchAuditLogs(createQueryPortsContext(), store, { filters: { kind: 'auth.login_success' } });

		expect(result.logs).toEqual([]);
	});
});

describe('Audit disclosure', () => {
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

		const result = await fetchAuditLogs(ctx, adminStore, { limit: 2 });

		expect(result.logs).toEqual([
			expect.objectContaining({
				id: 'org-log',
				actor: null,
				resourceId,
				details: { subject_label: 'Historical subject', actor_identifier: 'f***@example.com' }
			})
		]);
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

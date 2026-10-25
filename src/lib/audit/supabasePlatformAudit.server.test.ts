import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabasePlatformAuditStore } from './supabasePlatformAudit.server';

function makeAuditSupabase(
	rows: Array<Record<string, unknown>>,
	error: unknown = null
): {
	supabase: unknown;
	query: {
		select: ReturnType<typeof vi.fn>;
		order: ReturnType<typeof vi.fn>;
		eq: ReturnType<typeof vi.fn>;
		limit: ReturnType<typeof vi.fn>;
		range: ReturnType<typeof vi.fn>;
	};
} {
	const query = {
		eq: vi.fn(function eq() {
			return query;
		}),
		select: vi.fn(function select() {
			return query;
		}),
		order: vi.fn(function order() {
			return query;
		}),
		limit: vi.fn(function limit() {
			return query;
		}),
		range: vi.fn(function range() {
			return query;
		}),
		then(resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) {
			return Promise.resolve({ data: rows, error }).then(resolve, reject);
		}
	};

	return {
		query,
		supabase: {
			from: vi.fn(() => query)
		}
	};
}

describe('Supabase PlatformAudit adapter', () => {
	it('returns only dashboard activity fields even when the provider includes sensitive Audit data', async () => {
		const { supabase, query } = makeAuditSupabase([
			{
				id: 'event-1',
				action: 'training_record.updated',
				user_id: 'owner-1',
				timestamp: '2026-06-08T15:00:00.000Z',
				details: { actor: 'private@example.test', note: 'private note' },
				ip_address: '203.0.113.10',
				user_agent: 'private browser',
				org_id: 'organization-1',
				resource_id: 'training-record-1'
			}
		]);

		await expect(
			createSupabasePlatformAuditStore(supabase as never).listRecentActivity({ limit: 10 })
		).resolves.toEqual([
			{
				id: 'event-1',
				action: 'training_record.updated',
				user_id: 'owner-1',
				timestamp: '2026-06-08T15:00:00.000Z'
			}
		]);
		expect(query.select).toHaveBeenCalledWith('id, action, user_id, timestamp');
		expect(query.limit).toHaveBeenCalledWith(10);
	});

	it.each([
		{
			name: 'dashboard activity',
			operation: 'table audit_logs recent activity',
			read: (store: ReturnType<typeof createSupabasePlatformAuditStore>) => store.listRecentActivity({ limit: 10 })
		},
		{
			name: 'organization activity',
			operation: 'table audit_logs recent by organization',
			read: (store: ReturnType<typeof createSupabasePlatformAuditStore>) =>
				store.listRecentByOrganization({ orgId: 'organization-1', limit: 10 })
		},
		{
			name: 'user activity',
			operation: 'table audit_logs recent by user',
			read: (store: ReturnType<typeof createSupabasePlatformAuditStore>) =>
				store.listRecentByUser({ userId: 'user-1', limit: 10 })
		}
	])('rejects $name provider failures without exposing the private provider payload', async ({ read, operation }) => {
		const { supabase } = makeAuditSupabase([], { message: 'private database contents', code: 'XX000' });
		const error = await read(createSupabasePlatformAuditStore(supabase as never)).then(
			() => null,
			(error: unknown) => error
		);
		expect(error).toEqual(new Error(`${operation} failed`));
	});
});

describe('Supabase PlatformAudit adapter Activity read', () => {
	const input = {
		actions: ['suspend_user'],
		prefixes: ['admin.'],
		search: 'pat',
		from: new Date('2026-10-21T00:00:00.000Z'),
		to: new Date('2026-10-23T00:00:00.000Z'),
		offset: 50,
		limit: 50
	};

	function storeAnswering(respond: (request: Request) => Response, requests: Request[] = []) {
		return createSupabasePlatformAuditStore(
			createClient('http://localhost:9', 'synthetic-service-key', {
				auth: { persistSession: false, autoRefreshToken: false },
				global: {
					fetch: async (url, init) => {
						const request = new Request(url, init);
						requests.push(request);
						return respond(request);
					}
				}
			})
		);
	}

	it('asks the database for one page and maps the row, total and clamped offset', async () => {
		const requests: Request[] = [];
		const store = storeAnswering(
			() =>
				Response.json([
					{
						id: 'event-1',
						timestamp: '2026-10-22T12:00:00+00:00',
						user_id: 'user-1',
						org_id: 'org-1',
						org_name: 'Alpha Company',
						actor_email: null,
						actor_name: null,
						action: 'suspend_org',
						resource_type: 'organization',
						resource_id: 'org-1',
						ip_address: '203.0.113.10',
						details: { actorEmail: 'robert@example.test' },
						severity: 'critical',
						total_count: 51,
						page_offset: 50
					}
				]),
			requests
		);

		await expect(store.listActivity(input)).resolves.toEqual({
			events: [
				{
					id: 'event-1',
					timestamp: '2026-10-22T12:00:00+00:00',
					action: 'suspend_org',
					severity: 'critical',
					userId: 'user-1',
					orgId: 'org-1',
					orgName: 'Alpha Company',
					actorEmail: null,
					actorName: null,
					resourceType: 'organization',
					resourceId: 'org-1',
					ipAddress: '203.0.113.10',
					details: { actorEmail: 'robert@example.test' }
				}
			],
			totalCount: 51,
			offset: 50
		});
		expect(requests).toHaveLength(1);
		expect(new URL(requests[0].url).pathname).toBe('/rest/v1/rpc/list_platform_activity');
		expect(await requests[0].json()).toEqual({
			p_actions: ['suspend_user'],
			p_prefixes: ['admin.'],
			p_search: 'pat',
			p_from: '2026-10-21T00:00:00.000Z',
			p_to: '2026-10-23T00:00:00.000Z',
			p_limit: 50,
			p_offset: 50
		});
	});

	it('carries the actor account read with the row, lower-casing the email', async () => {
		const store = storeAnswering(() =>
			Response.json([
				{
					id: 'event-1',
					timestamp: '2026-10-22T12:00:00+00:00',
					user_id: 'user-1',
					org_id: 'org-1',
					org_name: 'Alpha Company',
					actor_email: 'Robert@Example.test',
					actor_name: 'CPT Robert Cole',
					action: 'suspend_org',
					resource_type: 'organization',
					resource_id: 'org-1',
					ip_address: null,
					details: { targetName: 'Alpha Company' },
					severity: 'critical',
					total_count: 1,
					page_offset: 0
				}
			])
		);

		const { events } = await store.listActivity(input);

		expect(events[0]).toMatchObject({
			actorEmail: 'robert@example.test',
			actorName: 'CPT Robert Cole',
			details: { targetName: 'Alpha Company' }
		});
	});

	it('reports an empty result as no events and a zero total', async () => {
		const store = storeAnswering(() => Response.json([]));
		await expect(store.listActivity({ ...input, search: '', from: null, to: null })).resolves.toEqual({
			events: [],
			totalCount: 0,
			offset: 0
		});
	});

	it('rejects a failed read without exposing the provider payload', async () => {
		const store = storeAnswering(() => Response.json({ code: '42501', message: 'private detail' }, { status: 403 }));
		await expect(store.listActivity(input)).rejects.toThrow('function list_platform_activity failed');
	});
});

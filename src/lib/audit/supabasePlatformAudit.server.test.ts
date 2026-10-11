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
	it('reads distinct actions with a bounded provider query', async () => {
		const { supabase, query } = makeAuditSupabase([
			{ action: 'admin.org.gift_tier' },
			{ action: 'admin.user.password_reset' },
			{ action: 'admin.org.gift_tier' }
		]);

		const result = await createSupabasePlatformAuditStore(supabase as never).listDistinctActions();

		expect(result).toEqual(['admin.org.gift_tier', 'admin.user.password_reset']);
		expect(query.limit).toHaveBeenCalledWith(1000);
		expect(query.range).not.toHaveBeenCalled();
	});

	it('surfaces distinct action provider failures', async () => {
		const { supabase } = makeAuditSupabase([], { message: 'database offline', code: 'XX000' });

		await expect(createSupabasePlatformAuditStore(supabase as never).listDistinctActions()).rejects.toThrow(
			'table audit_logs distinct actions failed'
		);
	});

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

	it('preserves stored masked details and IP in the full Audit record projection', async () => {
		const { supabase } = makeAuditSupabase([
			{
				id: 'event-1',
				user_id: 'user-1',
				org_id: 'organization-1',
				action: 'training_record.updated',
				resource_type: 'training_record',
				resource_id: 'record-1',
				ip_address: '203.0.113.10',
				details: { email: 's***@example.test', note: '[REDACTED]', subject_id: 'person-1' },
				severity: 'info',
				timestamp: '2026-06-08T15:00:00.000Z'
			}
		]);

		const result = await createSupabasePlatformAuditStore(supabase as never).listLogs({ offset: 0, limit: 50 });
		expect(result.logs).toEqual([
			{
				id: 'event-1',
				userId: 'user-1',
				orgId: 'organization-1',
				action: 'training_record.updated',
				resourceType: 'training_record',
				resourceId: 'record-1',
				ipAddress: '203.0.113.10',
				details: { email: 's***@example.test', note: '[REDACTED]', subject_id: 'person-1' },
				severity: 'info',
				timestamp: '2026-06-08T15:00:00.000Z'
			}
		]);
	});

	it.each([
		{
			name: 'dashboard activity',
			operation: 'table audit_logs recent activity',
			read: (store: ReturnType<typeof createSupabasePlatformAuditStore>) => store.listRecentActivity({ limit: 10 })
		},
		{
			name: 'full Audit log',
			operation: 'table audit_logs list',
			read: (store: ReturnType<typeof createSupabasePlatformAuditStore>) => store.listLogs({ offset: 0, limit: 50 })
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

describe('Supabase PlatformAudit adapter paging past the last row', () => {
	function storeOver(totalCount: number, requests: Request[] = []) {
		const fetch: typeof globalThis.fetch = async (input, init) => {
			const request = new Request(input, init);
			requests.push(request);
			const offset = Number(new URL(request.url).searchParams.get('offset') ?? 0);
			if (request.method === 'HEAD') return new Response(null, { headers: { 'content-range': `*/${totalCount}` } });
			if (offset > 0 && offset >= totalCount)
				return Response.json(
					{
						code: 'PGRST103',
						details: `An offset of ${offset} was requested, but there are only ${totalCount} rows.`,
						hint: null,
						message: 'Requested range not satisfiable'
					},
					{ status: 416, headers: { 'content-range': `*/${totalCount}` } }
				);
			return Response.json([], { headers: { 'content-range': `*/${totalCount}` } });
		};
		return createSupabasePlatformAuditStore(
			createClient('http://localhost:9', 'synthetic-service-key', {
				auth: { persistSession: false, autoRefreshToken: false },
				global: { fetch }
			})
		);
	}

	it('reports the filtered total and no entries for a page past the last row', async () => {
		const requests: Request[] = [];
		const store = storeOver(105, requests);

		await expect(store.listLogs({ offset: 5000, limit: 50, action: 'a.b', severity: 'info' })).resolves.toEqual({
			logs: [],
			totalCount: 105
		});
		const count = requests.find((request) => request.method === 'HEAD')!;
		expect(new URL(count.url).searchParams.get('action')).toBe('eq.a.b');
		expect(new URL(count.url).searchParams.get('severity')).toBe('eq.info');
	});

	it('still rejects a failed read that is not a page past the end', async () => {
		const store = createSupabasePlatformAuditStore(
			createClient('http://localhost:9', 'synthetic-service-key', {
				auth: { persistSession: false, autoRefreshToken: false },
				global: { fetch: async () => Response.json({ code: '42501', message: 'denied' }, { status: 403 }) }
			})
		);
		await expect(store.listLogs({ offset: 50, limit: 50 })).rejects.toThrow('table audit_logs list failed');
	});
});

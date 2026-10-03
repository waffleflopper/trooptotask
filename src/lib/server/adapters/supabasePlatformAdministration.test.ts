import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabasePlatformAdministrationStore } from './supabasePlatformAdministration';
import type { PlatformAdministrationStore } from '$lib/server/core/useCases/platformAdministration';

const VALID_USER_ID = '11111111-1111-1111-1111-111111111111';
const VALID_ORG_ID = '22222222-2222-2222-2222-222222222222';
const PROVIDER_ERROR = { message: 'database offline', code: 'XX000' };

type SupabaseResult<T = unknown> = {
	data: T | null;
	error: unknown;
	count?: number | null;
};

type Call = {
	method: string;
	args: unknown[];
};

function createThenableQueryBuilder(result: SupabaseResult) {
	const calls: Call[] = [];
	const builder: Record<string, unknown> = {
		select: track('select'),
		eq: track('eq'),
		is: track('is'),
		ilike: track('ilike'),
		order: track('order'),
		limit: track('limit'),
		update: track('update'),
		delete: track('delete'),
		upsert: (...args: unknown[]) => {
			calls.push({ method: 'upsert', args });
			return Promise.resolve(result);
		},
		then: Promise.resolve(result).then.bind(Promise.resolve(result))
	};

	function track(method: string) {
		return (...args: unknown[]) => {
			calls.push({ method, args });
			return builder;
		};
	}

	return { builder, calls };
}

function createStoreWithRpcResult(result: SupabaseResult): {
	store: PlatformAdministrationStore;
	rpc: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
} {
	const rpc = vi.fn().mockResolvedValue(result);
	const from = vi.fn();
	const store = createSupabasePlatformAdministrationStore({ rpc, from } as never);
	return { store, rpc, from };
}

function createStoreWithFromResult(result: SupabaseResult): {
	store: PlatformAdministrationStore;
	from: ReturnType<typeof vi.fn>;
	calls: Call[];
} {
	const { builder, calls } = createThenableQueryBuilder(result);
	const from = vi.fn(() => builder);
	const store = createSupabasePlatformAdministrationStore({ from } as never);
	return { store, from, calls };
}

describe('createSupabasePlatformAdministrationStore', () => {
	it.each([
		{
			name: 'countPlatformUsers',
			create: () => createStoreWithRpcResult({ data: null, error: PROVIDER_ERROR }),
			run: (store: PlatformAdministrationStore) => store.countPlatformUsers(),
			message: 'rpc count_platform_users failed: database offline (XX000)'
		},
		{
			name: 'listDailySignupsLast30Days',
			create: () => createStoreWithRpcResult({ data: null, error: PROVIDER_ERROR }),
			run: (store: PlatformAdministrationStore) => store.listDailySignupsLast30Days(),
			message: 'rpc daily_signups_last_30_days failed: database offline (XX000)'
		},
		{
			name: 'searchUsersByEmail',
			create: () => createStoreWithRpcResult({ data: null, error: PROVIDER_ERROR }),
			run: (store: PlatformAdministrationStore) => store.searchUsersByEmail({ query: 'alpha', maxResults: 5 }),
			message: 'rpc search_users_by_email failed: database offline (XX000)'
		},
		{
			name: 'countOrganizations',
			create: () => createStoreWithFromResult({ data: null, error: PROVIDER_ERROR, count: null }),
			run: (store: PlatformAdministrationStore) => store.countOrganizations(),
			message: 'table organizations count failed: database offline (XX000)'
		},
		{
			name: 'countPendingAccessRequests',
			create: () => createStoreWithFromResult({ data: null, error: PROVIDER_ERROR, count: null }),
			run: (store: PlatformAdministrationStore) => store.countPendingAccessRequests(),
			message: 'table access_requests pending count failed: database offline (XX000)'
		},
		{
			name: 'countOrganizationsForUser',
			create: () => createStoreWithFromResult({ data: null, error: PROVIDER_ERROR, count: null }),
			run: (store: PlatformAdministrationStore) => store.countOrganizationsForUser(VALID_USER_ID),
			message: 'table organization_memberships user count failed: database offline (XX000)'
		},
		{
			name: 'searchOrganizationsByName',
			create: () => createStoreWithFromResult({ data: null, error: PROVIDER_ERROR }),
			run: (store: PlatformAdministrationStore) => store.searchOrganizationsByName({ query: 'alpha', maxResults: 5 }),
			message: 'table organizations search failed: database offline (XX000)'
		},
		{
			name: 'countActivePersonnelForOrganization',
			create: () => createStoreWithFromResult({ data: null, error: PROVIDER_ERROR, count: null }),
			run: (store: PlatformAdministrationStore) => store.countActivePersonnelForOrganization(VALID_ORG_ID),
			message: 'table personnel active count failed: database offline (XX000)'
		}
	])('propagates provider failures from $name', async ({ create, run, message }) => {
		const { store } = create();

		await expect(run(store)).rejects.toThrow(message);
	});

	it('does not report an empty Feedback queue when its source count fails', async () => {
		const { store } = createStoreWithFromResult({ data: null, error: PROVIDER_ERROR, count: 7 });

		await expect(store.countPendingFeedback()).rejects.toMatchObject({ cause: PROVIDER_ERROR });
	});

	const writes = [
		{
			name: 'suspendUser',
			method: 'POST',
			table: 'user_suspensions',
			field: 'user_id',
			id: VALID_USER_ID,
			run: (store: PlatformAdministrationStore) =>
				store.suspendUser({ userId: VALID_USER_ID, suspendedBy: VALID_ORG_ID, reason: 'Synthetic reason' })
		},
		{
			name: 'unsuspendUser',
			method: 'DELETE',
			table: 'user_suspensions',
			field: 'user_id',
			id: VALID_USER_ID,
			run: (store: PlatformAdministrationStore) => store.unsuspendUser(VALID_USER_ID)
		},
		{
			name: 'suspendOrganization',
			method: 'PATCH',
			table: 'organizations',
			field: 'id',
			id: VALID_ORG_ID,
			run: (store: PlatformAdministrationStore) =>
				store.suspendOrganization({ organizationId: VALID_ORG_ID, suspendedAt: new Date('2026-06-01T12:00:00.000Z') })
		},
		{
			name: 'unsuspendOrganization',
			method: 'PATCH',
			table: 'organizations',
			field: 'id',
			id: VALID_ORG_ID,
			run: (store: PlatformAdministrationStore) => store.unsuspendOrganization(VALID_ORG_ID)
		}
	];

	describe.each(writes)('$name response acknowledgment', ({ method, table, field, id, run }) => {
		function storeWithResponse(body: unknown, status = 200, inspect?: (request: Request) => void) {
			return createSupabasePlatformAdministrationStore(
				createClient('http://127.0.0.1:9', 'synthetic-service', {
					auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
					global: {
						fetch: async (input, init) => {
							inspect?.(new Request(input, init));
							return Response.json(body, { status });
						}
					}
				})
			);
		}

		it('requests a selected representation for only the intended target and accepts its exact identity', async () => {
			let requests = 0;
			const store = storeWithResponse([{ [field]: id }], 200, (request) => {
				requests++;
				const url = new URL(request.url);
				expect(request.method).toBe(method);
				expect(url.pathname).toBe(`/rest/v1/${table}`);
				expect(url.searchParams.get('select')).toBe(field);
				expect(request.headers.get('prefer')).toContain('return=representation');
				if (method !== 'POST') expect(url.searchParams.get(field)).toBe(`eq.${id}`);
			});
			await expect(run(store)).resolves.toBeUndefined();
			expect(requests).toBe(1);
		});

		it.each([
			{ name: 'absent representation', body: null },
			{ name: 'no saved row', body: [] },
			{ name: 'wrong target', body: [{ [field]: '33333333-3333-3333-3333-333333333333' }] },
			{ name: 'multiple saved rows', body: [{ [field]: id }, { [field]: id }] },
			{ name: 'malformed saved identity', body: [{ [field]: [id] }] },
			{ name: 'provider failure', body: PROVIDER_ERROR, status: 503 }
		])('rejects $name instead of acknowledging the mutation', async ({ body, status }) => {
			await expect(run(storeWithResponse(body, status))).rejects.toThrow();
		});
	});
});

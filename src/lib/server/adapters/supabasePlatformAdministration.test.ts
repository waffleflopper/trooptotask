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
			name: 'countPendingFeedback',
			create: () => createStoreWithFromResult({ data: null, error: PROVIDER_ERROR, count: null }),
			run: (store: PlatformAdministrationStore) => store.countPendingFeedback(),
			message: 'table beta_feedback new count failed: database offline (XX000)'
		},
		{
			name: 'listRecentActivity',
			create: () => createStoreWithFromResult({ data: null, error: PROVIDER_ERROR }),
			run: (store: PlatformAdministrationStore) => store.listRecentActivity(10),
			message: 'table audit_logs recent activity failed: database offline (XX000)'
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

	it.each([
		{
			name: 'unsuspendUser',
			run: (store: PlatformAdministrationStore) => store.unsuspendUser(VALID_USER_ID),
			table: 'user_suspensions',
			method: 'delete',
			args: [{ count: 'exact' }],
			message: 'table user_suspensions delete failed: no rows affected'
		},
		{
			name: 'suspendOrganization',
			run: (store: PlatformAdministrationStore) =>
				store.suspendOrganization({
					organizationId: VALID_ORG_ID,
					suspendedAt: new Date('2026-06-01T12:00:00.000Z')
				}),
			table: 'organizations',
			method: 'update',
			args: [{ suspended_at: '2026-06-01T12:00:00.000Z' }, { count: 'exact' }],
			message: 'table organizations suspend update failed: no rows affected'
		},
		{
			name: 'unsuspendOrganization',
			run: (store: PlatformAdministrationStore) => store.unsuspendOrganization(VALID_ORG_ID),
			table: 'organizations',
			method: 'update',
			args: [{ suspended_at: null }, { count: 'exact' }],
			message: 'table organizations unsuspend update failed: no rows affected'
		}
	])('rejects $name when Supabase affects no rows', async ({ run, table, method, args, message }) => {
		const { store, from, calls } = createStoreWithFromResult({ data: null, error: null, count: 0 });

		await expect(run(store)).rejects.toThrow(message);

		expect(from).toHaveBeenCalledWith(table);
		expect(calls).toContainEqual({ method, args });
	});
});

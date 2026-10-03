import { describe, expect, it, vi } from 'vitest';
import { createSupabasePlatformAdministrationStore } from './supabasePlatformAdministration';
import type { PlatformAdministrationStore } from '$lib/server/core/useCases/platformAdministration';

const PROVIDER_ERROR = { message: 'database offline', code: 'XX000' };

type SupabaseResult = { data: unknown; error: unknown; count?: number | null };

function createStoreWithRpcResult(result: SupabaseResult) {
	return { store: createSupabasePlatformAdministrationStore({ rpc: vi.fn().mockResolvedValue(result) } as never) };
}

function createStoreWithFromResult(result: SupabaseResult) {
	const builder = {
		select: () => builder,
		eq: () => builder,
		then: Promise.resolve(result).then.bind(Promise.resolve(result))
	};
	return { store: createSupabasePlatformAdministrationStore({ from: () => builder } as never) };
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
		}
	])('propagates provider failures from $name', async ({ create, run, message }) => {
		const { store } = create();

		await expect(run(store)).rejects.toThrow(message);
	});

	it('does not report an empty Feedback queue when its source count fails', async () => {
		const { store } = createStoreWithFromResult({ data: null, error: PROVIDER_ERROR, count: 7 });

		await expect(store.countPendingFeedback()).rejects.toMatchObject({ cause: PROVIDER_ERROR });
	});
});

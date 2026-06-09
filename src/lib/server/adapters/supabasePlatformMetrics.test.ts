import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlatformMetrics } from '$lib/server/core/useCases/platformMetrics';
import { createSupabasePlatformMetricsStore } from './supabasePlatformMetrics';

type SupabaseResult<T = unknown> = {
	data: T | null;
	error: unknown;
	count?: number | null;
};

function createStoreWithRpcResults(results: Record<string, SupabaseResult>) {
	const rpc = vi.fn(async (name: string, params?: unknown) => {
		const result = results[name];
		if (!result) {
			throw new Error(`Unexpected RPC ${name} ${JSON.stringify(params)}`);
		}
		return result;
	});
	const from = vi.fn(() => {
		throw new Error('Unexpected table read');
	});

	return {
		store: createSupabasePlatformMetricsStore({ rpc, from } as never),
		rpc,
		from
	};
}

describe('createSupabasePlatformMetricsStore', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('counts memberships through the aggregate metrics RPC', async () => {
		const { store, rpc, from } = createStoreWithRpcResults({
			count_memberships_by_organization: {
				data: [
					{ organization_id: 'org-1', membership_count: 2 },
					{ organization_id: 'org-2', membership_count: '3' }
				],
				error: null
			}
		});

		const counts = await store.countMembershipsByOrganization(['org-1', 'org-2']);

		expect([...counts]).toEqual([
			['org-1', 2],
			['org-2', 3]
		]);
		expect(rpc).toHaveBeenCalledWith('count_memberships_by_organization', {
			p_org_ids: ['org-1', 'org-2']
		});
		expect(from).not.toHaveBeenCalled();
	});

	it('counts active personnel through the aggregate metrics RPC', async () => {
		const { store, rpc, from } = createStoreWithRpcResults({
			count_personnel_by_organization: {
				data: [
					{ organization_id: 'org-1', personnel_count: 4 },
					{ organization_id: 'org-2', personnel_count: '5' }
				],
				error: null
			}
		});

		const counts = await store.countActivePersonnelByOrganization(['org-1', 'org-2']);

		expect([...counts]).toEqual([
			['org-1', 4],
			['org-2', 5]
		]);
		expect(rpc).toHaveBeenCalledWith('count_personnel_by_organization', {
			p_org_ids: ['org-1', 'org-2']
		});
		expect(from).not.toHaveBeenCalled();
	});

	it('loads owner membership metrics through the aggregate owner RPC', async () => {
		const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { store, rpc, from } = createStoreWithRpcResults({
			list_platform_owner_membership_metrics: {
				data: [
					{
						organization_id: 'org-1',
						owner_count: 1,
						owner_user_id: 'owner-1',
						owner_email: 'owner-1@example.mil'
					},
					{
						organization_id: 'org-2',
						owner_count: '2',
						owner_user_id: null,
						owner_email: null
					}
				],
				error: null
			}
		});
		const metrics = createPlatformMetrics({ store });

		const owners = await metrics.getOwnerMembershipsByOrganization(['org-1', 'org-2', 'org-3']);

		expect(owners.get('org-1')).toEqual({
			kind: 'single',
			membership: {
				organizationId: 'org-1',
				userId: 'owner-1',
				email: 'owner-1@example.mil'
			}
		});
		expect(owners.get('org-2')).toEqual({ kind: 'multiple', count: 2 });
		expect(owners.get('org-3')).toEqual({ kind: 'none' });
		expect(rpc).toHaveBeenCalledWith('list_platform_owner_membership_metrics', {
			p_org_ids: ['org-1', 'org-2', 'org-3']
		});
		expect(from).not.toHaveBeenCalled();
		expect(consoleWarn).toHaveBeenCalledWith('[admin] Organization has unexpected owner membership count:', 'org-2', 2);
	});

	it('keeps empty metric fallbacks when aggregate RPCs fail', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { store } = createStoreWithRpcResults({
			count_memberships_by_organization: {
				data: null,
				error: new Error('membership rpc failed')
			},
			list_platform_owner_membership_metrics: {
				data: null,
				error: new Error('owner metric rpc failed')
			}
		});
		const metrics = createPlatformMetrics({ store });

		const memberCounts = await metrics.countMembershipsByOrganization(['org-1']);
		const owners = await metrics.getOwnerMembershipsByOrganization(['org-1']);

		expect(memberCounts.size).toBe(0);
		expect(owners.size).toBe(0);
		expect(consoleError).toHaveBeenCalledWith('[admin] Failed to batch membership counts:', expect.any(Error));
		expect(consoleError).toHaveBeenCalledWith('[admin] Failed to batch owner memberships:', expect.any(Error));
	});
});

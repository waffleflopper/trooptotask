import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadWithAdminContext } from '$lib/server/adapters/adminAdapter';
import type { BillingSnapshot } from '$lib/types/subscription';
import { visibleBillingSnapshotForAdminRole } from '$lib/server/adminBillingVisibility';
import { createSupabasePlatformOrganizationLedger } from '$lib/server/adapters/supabasePlatformOrganizationLedger';

export function _visibleBillingSnapshotForRole(
	role: Parameters<typeof visibleBillingSnapshotForAdminRole>[0],
	snapshot: BillingSnapshot | null
): BillingSnapshot | null {
	return visibleBillingSnapshotForAdminRole(role, snapshot);
}

export const load: PageServerLoad = loadWithAdminContext({
	page: 'subscriptions',
	fn: async (ctx, event) => {
		try {
			return await createSupabasePlatformOrganizationLedger(ctx).listSubscriptions({
				page: event.url.searchParams.get('page'),
				pageSize: event.url.searchParams.get('pageSize'),
				q: event.url.searchParams.get('q'),
				tier: event.url.searchParams.get('tier'),
				status: event.url.searchParams.get('status')
			});
		} catch (err) {
			console.error('Admin subscriptions query failed:', err);
			error(500, 'Unable to load platform subscriptions.');
		}
	}
});

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadWithAdminContext } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformOrganizationLedger } from '$lib/server/adapters/supabasePlatformOrganizationLedger';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'organizations',
	fn: async (ctx, event) => {
		try {
			return await createSupabasePlatformOrganizationLedger(ctx).listOrganizations({
				page: event.url.searchParams.get('page'),
				pageSize: event.url.searchParams.get('pageSize'),
				q: event.url.searchParams.get('q')
			});
		} catch (err) {
			console.error('Admin orgs query failed:', err);
			error(500, 'Unable to load platform organizations.');
		}
	}
});

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadWithAdminContext } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformActivationHealth } from '$lib/server/adapters/supabasePlatformActivationHealth';
import { createSupabasePlatformOrganizationLedger } from '$lib/server/adapters/supabasePlatformOrganizationLedger';
import {
	degradedActivationHealthSummary,
	type PlatformActivationHealthSummary
} from '$lib/server/core/useCases/platformActivationHealth';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'organizations',
	fn: async (ctx, event) => {
		try {
			const ledger = await createSupabasePlatformOrganizationLedger(ctx).listOrganizations({
				page: event.url.searchParams.get('page'),
				pageSize: event.url.searchParams.get('pageSize'),
				q: event.url.searchParams.get('q'),
				tier: event.url.searchParams.get('tier'),
				status: event.url.searchParams.get('status')
			});
			let activationHealth: PlatformActivationHealthSummary;
			try {
				activationHealth = await createSupabasePlatformActivationHealth(ctx).summarize();
			} catch (err) {
				console.error('Admin organizations activation health query failed:', err);
				activationHealth = degradedActivationHealthSummary();
			}
			return { ...ledger, activationHealth };
		} catch (err) {
			console.error('Admin orgs query failed:', err);
			error(500, 'Unable to load platform organizations.');
		}
	}
});

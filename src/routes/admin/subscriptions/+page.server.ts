import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadWithAdminContext } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformBillingHealth } from '$lib/server/adapters/supabasePlatformBillingHealth';
import { createSupabasePlatformOrganizationLedger } from '$lib/server/adapters/supabasePlatformOrganizationLedger';
import type { PlatformBillingHealthSummary } from '$lib/server/core/useCases/platformBillingHealth';

function degradedBillingHealthSummary(now = new Date()): PlatformBillingHealthSummary {
	return {
		generatedAt: now.toISOString(),
		overallState: 'diagnostics_unavailable',
		states: ['diagnostics_unavailable'],
		counts: {
			retryableFailures: 0,
			permanentFailures: 0,
			staleFailedEvents: 0,
			recentPaymentFailures: 0,
			driftedOrganizations: 0,
			staleReconciliation: 0,
			supportAttentionItems: 0
		},
		issues: [],
		diagnosticsError: true
	};
}

export const load: PageServerLoad = loadWithAdminContext({
	page: 'subscriptions',
	fn: async (ctx, event) => {
		try {
			const ledger = await createSupabasePlatformOrganizationLedger(ctx).listSubscriptions({
				page: event.url.searchParams.get('page'),
				pageSize: event.url.searchParams.get('pageSize'),
				q: event.url.searchParams.get('q'),
				tier: event.url.searchParams.get('tier'),
				status: event.url.searchParams.get('status')
			});
			let billingHealth: PlatformBillingHealthSummary;
			try {
				billingHealth = await createSupabasePlatformBillingHealth(ctx).summarize();
			} catch (err) {
				console.error('Admin subscriptions billing health query failed:', err);
				billingHealth = degradedBillingHealthSummary();
			}
			return { ...ledger, billingHealth, adminRole: ctx.adminUser.role };
		} catch (err) {
			console.error('Admin subscriptions query failed:', err);
			error(500, 'Unable to load platform subscriptions.');
		}
	}
});

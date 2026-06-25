import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminAction, loadWithAdminContext } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformBillingEvents } from '$lib/server/adapters/supabasePlatformBillingEvents';
import { createSupabasePlatformBillingHealth } from '$lib/server/adapters/supabasePlatformBillingHealth';
import { degradedBillingHealthSummary } from '$lib/server/core/useCases/platformBillingHealthFallback';
import type { PlatformBillingHealthSummary } from '$lib/server/core/useCases/platformBillingHealth';

const RECENT_EVENT_LIMIT = 50;

export const load: PageServerLoad = loadWithAdminContext({
	page: 'billing-events',
	fn: async (ctx) => {
		const diagnostics = await createSupabasePlatformBillingEvents(ctx).listDiagnostics({ limit: RECENT_EVENT_LIMIT });
		let billingHealth: PlatformBillingHealthSummary;
		try {
			billingHealth = await createSupabasePlatformBillingHealth(ctx).summarize();
		} catch (err) {
			console.error('Admin billing events health query failed:', err);
			billingHealth = degradedBillingHealthSummary();
		}
		return { ...diagnostics, billingHealth, adminRole: ctx.adminUser.role };
	}
});

export const actions: Actions = {
	retry: adminAction({
		page: 'billing-events',
		fn: async (ctx, event) => {
			const formData = await event.request.formData();
			const eventId = String(formData.get('eventId') ?? '');
			const result = await createSupabasePlatformBillingEvents(ctx).retryEvent(eventId);
			if (!result.ok) return fail(result.status, { error: result.error, eventId });
			return { success: true, eventId, result: result.result, state: result.state };
		}
	})
};

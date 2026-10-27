import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestRosterSettingsContext } from '$lib/server/adapters/requestContexts.server';

/** The rank catalog the assignment type editor offers for roster pool rules. */
export function loadCalendarSettingsRankCatalog(event: {
	locals: App.Locals;
	cookies: Cookies;
	params: { orgId: string };
}) {
	return loadWithContext(event.locals, event.cookies, event.params.orgId, {
		context: createRequestRosterSettingsContext,
		policyAction: POLICY_ACTION_CATALOG.calendar.viewAvailability,
		policyResource: { kind: 'unscoped' },
		defer: true,
		fn: (ctx) => ctx.loadRankCatalog()
	});
}

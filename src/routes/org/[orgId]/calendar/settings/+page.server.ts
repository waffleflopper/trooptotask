import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestRosterSettingsContext } from '$lib/server/adapters/requestContexts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:org-core');
	return {
		rankCatalog: await loadWithContext(locals, cookies, params.orgId, {
			context: createRequestRosterSettingsContext,
			policyAction: POLICY_ACTION_CATALOG.calendar.viewAvailability,
			policyResource: { kind: 'unscoped' },
			defer: true,
			fn: (ctx) => ctx.loadRankCatalog()
		})
	};
};

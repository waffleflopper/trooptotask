import { loadDa6View, parseMonth } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestRosterSettingsContext } from '$lib/server/adapters/requestContexts.server';
import { settleWorkspaceDenial } from '$lib/server/adapters/streamedWorkspace';
import { formatToday } from '$lib/utils/dates';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals, cookies, depends }) => {
	depends('app:org-core', 'app:calendar-data');
	const today = formatToday();
	const month = parseMonth(url.searchParams.get('month'), today);
	const { data } = await loadWithContext(locals, cookies, params.orgId, {
		context: createRequestRosterSettingsContext,
		policyAction: POLICY_ACTION_CATALOG.calendar.viewAvailability,
		policyResource: { kind: 'unscoped' },
		defer: true,
		fn: (ctx) => loadDa6View(ctx, { typeId: params.typeId, month, today })
	});
	return { month, da6: { data: settleWorkspaceDenial(data, 'da6') } };
};

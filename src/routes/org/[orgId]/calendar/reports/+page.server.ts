import type { PageServerLoadEvent } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchCalendarReportData } from '$lib/server/core/useCases/calendarReportQuery';

export const load = async ({ params, locals, cookies, parent, depends }: PageServerLoadEvent) => {
	depends('app:org-core');
	const { orgId } = params;
	await parent();

	return loadWithContext(locals, cookies, orgId, {
		permission: 'calendar',
		policyAction: POLICY_ACTION_CATALOG.calendar.viewReports,
		fn: async (ctx) => fetchCalendarReportData(ctx)
	});
};

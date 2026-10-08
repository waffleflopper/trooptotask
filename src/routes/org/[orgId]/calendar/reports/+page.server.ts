import { fetchCalendarReportData } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarReportContext } from '$lib/server/adapters/requestContexts.server';
import type { PageServerLoadEvent } from './$types';

export const load = async ({ params, locals, cookies, depends }: PageServerLoadEvent) => {
	depends('app:org-core');
	const { orgId } = params;

	return loadWithContext(locals, cookies, orgId, {
		context: createRequestCalendarReportContext,
		policyAction: POLICY_ACTION_CATALOG.calendar.viewReports,
		policyResource: { kind: 'unscoped' },
		fn: async (ctx) => fetchCalendarReportData(ctx)
	});
};

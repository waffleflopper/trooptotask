import { fetchCalendarStatusDaysReport } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarRangeContext } from '$lib/server/adapters/requestContexts.server';
import { isDateOnly } from '$lib/utils/dates';
import type { RequestEvent } from '@sveltejs/kit';

export const _getConfig: RouteConfig<
	{ startDate: string; endDate: string },
	unknown,
	ReturnType<typeof createRequestCalendarRangeContext>
> = {
	context: createRequestCalendarRangeContext,
	policyAction: POLICY_ACTION_CATALOG.calendar.viewReports,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({
		startDate: event.url.searchParams.get('startDate') ?? '',
		endDate: event.url.searchParams.get('endDate') ?? ''
	}),
	fn: async (ctx, input) => {
		const { startDate, endDate } = input;

		if (!startDate || !endDate) fail(400, 'startDate and endDate query params are required');
		if (!isDateOnly(startDate) || !isDateOnly(endDate)) {
			fail(400, 'Dates must be in YYYY-MM-DD format');
		}
		if (startDate > endDate) fail(400, 'startDate must be before or equal to endDate');

		return fetchCalendarStatusDaysReport(ctx, input);
	}
};

export const GET = handle(_getConfig);

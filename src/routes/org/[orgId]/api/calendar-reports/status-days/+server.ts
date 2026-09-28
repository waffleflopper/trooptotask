import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { listAssignmentTypes, listAvailabilityEntries, listDailyAssignments } from '$features/calendar/index.server';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from '$lib/server/core/useCases/calendarPolicy';
import { resolveCalendarAssigneeScope } from '$lib/server/core/useCases/calendarScope';

export const _getConfig: RouteConfig<{ startDate: string; endDate: string }, unknown> = {
	policyAction: POLICY_ACTION_CATALOG.calendar.viewReports,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({
		startDate: event.url.searchParams.get('startDate') ?? '',
		endDate: event.url.searchParams.get('endDate') ?? ''
	}),
	fn: async (ctx, input) => {
		const { startDate, endDate } = input;

		if (!startDate || !endDate) fail(400, 'startDate and endDate query params are required');
		if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
			fail(400, 'Dates must be in YYYY-MM-DD format');
		}
		if (startDate > endDate) fail(400, 'startDate must be before or equal to endDate');
		await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewReports);

		const scope = await resolveCalendarAssigneeScope(ctx);

		const [entries, assignments, assignmentTypes] = await Promise.all([
			listAvailabilityEntries(ctx, {
				rangeStart: startDate,
				rangeEnd: endDate,
				personnelIds: scope?.personnelIds
			}),
			listDailyAssignments(ctx, { rangeStart: startDate, rangeEnd: endDate }, scope),
			listAssignmentTypes(ctx.store, ctx.auth.orgId)
		]);

		ctx.audit.log({ action: 'calendar_report.viewed', resourceType: 'calendar_report' });

		return {
			entries,
			assignments,
			assignmentTypes
		};
	}
};

export const GET = handle(_getConfig);

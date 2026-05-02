import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';
import { AssignmentTypeEntity } from '$lib/server/entities/assignmentType';
import type { QueryPorts } from '$lib/server/core/ports';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from '$lib/server/core/useCases/calendarPolicy';

export const _getConfig: RouteConfig<{ startDate: string; endDate: string }, unknown> = {
	permission: 'calendar',
	deferPolicyToUseCase: true,
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

		const scope = await resolveCalendarReportScope(ctx);

		const [entries, assignments, assignmentTypes] = await Promise.all([
			ctx.store.findMany<Record<string, unknown>>('availability_entries', ctx.auth.orgId, undefined, {
				...personnelInFilter(scope, 'personnel_id'),
				rangeFilters: [
					{ column: 'end_date', op: 'gte', value: startDate },
					{ column: 'start_date', op: 'lte', value: endDate }
				]
			}),
			ctx.store.findMany<Record<string, unknown>>('daily_assignments', ctx.auth.orgId, undefined, {
				rangeFilters: [
					{ column: 'date', op: 'gte', value: startDate },
					{ column: 'date', op: 'lte', value: endDate }
				]
			}),
			ctx.store.findMany<Record<string, unknown>>('assignment_types', ctx.auth.orgId)
		]);

		ctx.audit.log({ action: 'calendar_report.viewed', resourceType: 'calendar_report' });

		return {
			entries: AvailabilityEntryEntity.fromDbArray(entries),
			assignments: DailyAssignmentEntity.fromDbArray(filterRowsByCalendarAssigneeScope(assignments, scope)),
			assignmentTypes: AssignmentTypeEntity.fromDbArray(assignmentTypes)
		};
	}
};

export const GET = handle(_getConfig);

interface CalendarReportScope {
	groupIds: string[];
	personnelIds: string[];
}

async function resolveCalendarReportScope(ctx: QueryPorts): Promise<CalendarReportScope | null> {
	if (ctx.auth.scopeSet.kind !== 'groups') {
		return null;
	}

	const groupIds = [...new Set(ctx.auth.scopeSet.groupIds.filter(Boolean))];
	if (groupIds.length === 0) {
		return { groupIds: [], personnelIds: [] };
	}

	const personnelRows = await ctx.store.findMany<{ id: string }>('personnel', ctx.auth.orgId, undefined, {
		inFilters: { group_id: groupIds },
		select: 'id'
	});

	return {
		groupIds,
		personnelIds: personnelRows.map((row) => row.id)
	};
}

function personnelInFilter(scope: CalendarReportScope | null, column: string) {
	return scope ? { inFilters: { [column]: scope.personnelIds } } : {};
}

function filterRowsByCalendarAssigneeScope(
	rows: Record<string, unknown>[],
	scope: CalendarReportScope | null
): Record<string, unknown>[] {
	if (!scope) {
		return rows;
	}

	const allowedAssigneeIds = new Set([...scope.personnelIds, ...scope.groupIds]);
	return rows.filter((row) => typeof row.assignee_id === 'string' && allowedAssigneeIds.has(row.assignee_id));
}

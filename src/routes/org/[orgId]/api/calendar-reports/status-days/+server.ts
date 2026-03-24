import type { RequestEvent } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';
import { AssignmentTypeEntity } from '$lib/server/entities/assignmentType';

export const GET = handle<{ startDate: string; endDate: string }, unknown>({
	permission: 'privileged',
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

		const [entries, assignments, assignmentTypes] = await Promise.all([
			ctx.store.findMany<Record<string, unknown>>('availability_entries', ctx.auth.orgId, undefined, {
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
			assignments: DailyAssignmentEntity.fromDbArray(assignments),
			assignmentTypes: AssignmentTypeEntity.fromDbArray(assignmentTypes)
		};
	}
});

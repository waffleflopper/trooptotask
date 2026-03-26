import type { UseCaseContext } from '$lib/server/core/ports';
import type { AvailabilityEntry, SpecialDay, AssignmentType, DailyAssignment } from '$lib/types';
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';
import { SpecialDayEntity } from '$lib/server/entities/specialDay';
import { AssignmentTypeEntity } from '$lib/server/entities/assignmentType';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';
import { PinnedGroupsEntity } from '$lib/server/entities/pinnedGroups';

export interface CalendarQueryInput {
	rangeStart: string;
	rangeEnd: string;
}

export interface CalendarData {
	availabilityEntries: AvailabilityEntry[];
	specialDays: SpecialDay[];
	assignmentTypes: AssignmentType[];
	dailyAssignments: DailyAssignment[];
	pinnedGroups: string[];
}

export async function fetchCalendarData(ctx: UseCaseContext, input: CalendarQueryInput): Promise<CalendarData> {
	ctx.auth.requireView('calendar');

	const orgId = ctx.auth.orgId;
	const { rangeStart, rangeEnd } = input;

	const [availabilityRows, specialDayRows, assignmentTypeRows, dailyAssignmentRows, pinnedGroupRows] =
		await Promise.all([
			// Availability uses two-column overlap: end_date >= rangeStart AND start_date <= rangeEnd
			ctx.store.findMany<Record<string, unknown>>('availability_entries', orgId, undefined, {
				select: AvailabilityEntryEntity.select,
				rangeFilters: [
					{ column: 'end_date', op: 'gte', value: rangeStart },
					{ column: 'start_date', op: 'lte', value: rangeEnd }
				]
			}),
			// Special days: single-column date range
			ctx.store.findMany<Record<string, unknown>>('special_days', orgId, undefined, {
				rangeFilters: [
					{ column: 'date', op: 'gte', value: rangeStart },
					{ column: 'date', op: 'lte', value: rangeEnd }
				],
				orderBy: [{ column: 'date', ascending: true }]
			}),
			// Assignment types: no date filtering
			ctx.store.findMany<Record<string, unknown>>('assignment_types', orgId, undefined, {
				orderBy: [{ column: 'sort_order', ascending: true }]
			}),
			// Daily assignments: single-column date range
			ctx.store.findMany<Record<string, unknown>>('daily_assignments', orgId, undefined, {
				rangeFilters: [
					{ column: 'date', op: 'gte', value: rangeStart },
					{ column: 'date', op: 'lte', value: rangeEnd }
				]
			}),
			// Pinned groups: filtered by userId
			ctx.auth.userId
				? ctx.store.findMany<Record<string, unknown>>(
						'user_pinned_groups',
						orgId,
						{ user_id: ctx.auth.userId },
						{
							orderBy: [{ column: 'sort_order', ascending: true }]
						}
					)
				: Promise.resolve([])
		]);

	return {
		availabilityEntries: AvailabilityEntryEntity.fromDbArray(availabilityRows),
		specialDays: SpecialDayEntity.fromDbArray(specialDayRows),
		assignmentTypes: AssignmentTypeEntity.fromDbArray(assignmentTypeRows),
		dailyAssignments: DailyAssignmentEntity.fromDbArray(dailyAssignmentRows),
		pinnedGroups: PinnedGroupsEntity.fromDbArray(pinnedGroupRows)
	};
}

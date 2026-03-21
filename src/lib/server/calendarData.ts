import type { AvailabilityEntry, SpecialDay } from '$lib/types';
import type { AssignmentType, DailyAssignment } from '$features/calendar/stores/dailyAssignments.svelte';
import type { RosterHistoryItem } from '$features/duty-roster/stores/dutyRosterHistory.svelte';
import type { QueryModifier } from '$lib/server/repositoryFactory';
import { formatDate } from '$lib/utils/dates';
import {
	availabilityRepo,
	specialDayRepo,
	assignmentTypeRepo,
	dailyAssignmentRepo,
	rosterHistoryRepo,
	pinnedGroupRepo
} from '$lib/server/repositories';

export interface CalendarData {
	availabilityEntries: AvailabilityEntry[];
	specialDays: SpecialDay[];
	assignmentTypes: AssignmentType[];
	dailyAssignments: DailyAssignment[];
	pinnedGroups: string[];
	rosterHistory: RosterHistoryItem[];
}

export async function fetchCalendarData(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client type varies based on auth context
	supabase: any,
	orgId: string,
	userId: string | null
): Promise<CalendarData> {
	// Date range for calendar data (3 months past, 6 months future)
	const now = new Date();
	const rangeStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
	const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 7, 0);
	const rangeStartStr = formatDate(rangeStart);
	const rangeEndStr = formatDate(rangeEnd);

	// Availability uses a two-column overlap query (entries overlapping the range)
	const availabilityOverlapFilter: QueryModifier = (q) =>
		q.gte('end_date', rangeStartStr).lte('start_date', rangeEndStr);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder type
	const userFilter: QueryModifier = (q: any) => q.eq('user_id', userId);

	const [availabilityEntries, specialDaysResult, assignmentTypes, dailyAssignmentsResult, pinnedGroups, rosterHistory] =
		await Promise.all([
			availabilityRepo.list(supabase, orgId, { filters: [availabilityOverlapFilter] }),
			specialDayRepo.queryDateRange(supabase, orgId, {
				column: 'date',
				start: rangeStartStr,
				end: rangeEndStr
			}),
			assignmentTypeRepo.list(supabase, orgId),
			dailyAssignmentRepo.queryDateRange(supabase, orgId, {
				column: 'date',
				start: rangeStartStr,
				end: rangeEndStr
			}),
			userId ? pinnedGroupRepo.list(supabase, orgId, { filters: [userFilter] }) : Promise.resolve([]),
			rosterHistoryRepo.list(supabase, orgId, { limit: 50 })
		]);

	return {
		availabilityEntries,
		specialDays: specialDaysResult.data,
		assignmentTypes,
		dailyAssignments: dailyAssignmentsResult.data,
		pinnedGroups,
		rosterHistory
	};
}

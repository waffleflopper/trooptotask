import type { CalendarAssignmentReader, SavedAssignment } from './contracts';
import type { CalendarAssigneeScope } from '$lib/server/core/useCases/calendarScope';

interface DailyAssignmentQueryPorts {
	calendarAssignments: Pick<CalendarAssignmentReader, 'listRange'>;
}

export interface DailyAssignmentRange {
	rangeStart: string;
	rangeEnd: string;
}

/** Read saved slots for an authorized caller, using its explicit Calendar assignee scope. */
export async function listDailyAssignments(
	ctx: DailyAssignmentQueryPorts,
	range: DailyAssignmentRange,
	scope: CalendarAssigneeScope | null
): Promise<SavedAssignment[]> {
	const rows = await ctx.calendarAssignments.listRange(range);
	if (!scope) return rows;
	const allowedAssignees = new Set([...scope.personnelIds, ...scope.groupIds]);
	return rows.filter((row) => allowedAssignees.has(row.assigneeId));
}

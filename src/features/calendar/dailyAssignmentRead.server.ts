import type { DailyAssignment } from '$lib/types';
import type { CalendarAssigneeScope } from '$lib/server/core/useCases/calendarScope';
import { filterRowsByCalendarAssigneeScope } from '$lib/server/core/useCases/calendarScope';
import type { resolveCalendarAssigneeScope } from '$lib/server/core/useCases/calendarScope';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';
import type { CalendarWritePorts } from '$lib/server/core/useCases/calendarPolicy';

type DailyAssignmentQueryPorts = Pick<Parameters<typeof resolveCalendarAssigneeScope>[0], 'auth' | 'store'>;

export interface DailyAssignmentRange {
	rangeStart: string;
	rangeEnd: string;
}

/** Read saved slots for an authorized caller, using its explicit Calendar assignee scope. */
export async function listDailyAssignments(
	ctx: DailyAssignmentQueryPorts,
	range: DailyAssignmentRange,
	scope: CalendarAssigneeScope | null
): Promise<DailyAssignment[]> {
	const rows = await ctx.store.findMany<Record<string, unknown>>(
		DailyAssignmentEntity.table,
		ctx.auth.orgId,
		undefined,
		{
			rangeFilters: [
				{ column: 'date', op: 'gte', value: range.rangeStart },
				{ column: 'date', op: 'lte', value: range.rangeEnd }
			]
		}
	);
	return DailyAssignmentEntity.fromDbArray(filterRowsByCalendarAssigneeScope(rows, scope));
}

/** Keep the organization export's saved row shape, including fields outside the Calendar view. */
export function listDailyAssignmentExportRows(
	store: CalendarWritePorts['store'],
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>(DailyAssignmentEntity.table, orgId);
}

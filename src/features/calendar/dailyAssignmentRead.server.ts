import type { DailyAssignment } from '$features/calendar/contracts';
import type { CalendarAssigneeScope } from '$lib/server/core/useCases/calendarScope';
import { filterRowsByCalendarAssigneeScope } from '$lib/server/core/useCases/calendarScope';
import { DailyAssignmentEntity } from './dailyAssignmentEntity.server';
import type { CalendarWritePorts } from '$lib/server/core/useCases/calendarPolicy';
type DataStore = CalendarWritePorts['store'];
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';

interface DailyAssignmentQueryPorts {
	auth: OrganizationAccessGrant;
	store: DataStore;
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

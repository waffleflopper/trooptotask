import type { QueryWithRawStorePorts } from '$lib/server/core/ports';
import type { Personnel, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { GroupEntity } from '$lib/server/entities/group';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy';
import { groupInFilter, resolveCalendarGroupScope } from './calendarScope';

export interface CalendarReportData {
	allPersonnel: Personnel[];
	statusTypes: StatusType[];
	groups: Group[];
}

export async function fetchCalendarReportData(ctx: QueryWithRawStorePorts): Promise<CalendarReportData> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewReports);

	const orgId = ctx.auth.orgId;
	const scope = resolveCalendarGroupScope(ctx);

	const [allPersonnelRows, statusTypeRows, groupRows] = await Promise.all([
		ctx.rawStore.findMany<Record<string, unknown>>('personnel', orgId, undefined, {
			select: PersonnelEntity.select,
			...groupInFilter(scope, 'group_id'),
			isNull: { archived_at: true },
			orderBy: [{ column: 'last_name', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('status_types', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.rawStore.findMany<Record<string, unknown>>('groups', orgId, undefined, {
			...groupInFilter(scope, 'id'),
			orderBy: [{ column: 'sort_order', ascending: true }]
		})
	]);

	return {
		allPersonnel: PersonnelEntity.fromDbArray(allPersonnelRows),
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows),
		groups: GroupEntity.fromDbArray(groupRows)
	};
}

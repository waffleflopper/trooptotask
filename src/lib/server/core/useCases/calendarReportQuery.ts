import type { QueryWithRawStorePorts } from '$lib/server/core/ports';
import type { Personnel, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { GroupEntity } from '$lib/server/entities/group';
import { StatusTypeEntity } from '$lib/server/entities/statusType';

export interface CalendarReportData {
	allPersonnel: Personnel[];
	statusTypes: StatusType[];
	groups: Group[];
}

// Callers are responsible for enforcing access control. This function uses rawStore
// (unscoped) for personnel, so it must only be called from admin-gated routes.
export async function fetchCalendarReportData(ctx: QueryWithRawStorePorts): Promise<CalendarReportData> {
	const orgId = ctx.auth.orgId;

	const [allPersonnelRows, statusTypeRows, groupRows] = await Promise.all([
		ctx.rawStore.findMany<Record<string, unknown>>('personnel', orgId, undefined, {
			select: PersonnelEntity.select,
			isNull: { archived_at: true },
			orderBy: [{ column: 'last_name', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('status_types', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('groups', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		})
	]);

	return {
		allPersonnel: PersonnelEntity.fromDbArray(allPersonnelRows),
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows),
		groups: GroupEntity.fromDbArray(groupRows)
	};
}

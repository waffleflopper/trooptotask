import type { QueryWithRawStorePorts } from '$lib/server/core/ports';
import type { Personnel, StatusType } from '$lib/types';
import type { Group } from '$features/personnel/contracts';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { listGroupCatalog } from '$features/personnel/index.server';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy';
import { requirePersonnelCalendarRoster, resolveCalendarGroupScope } from './calendarScope';

export interface CalendarReportData {
	allPersonnel: Personnel[];
	statusTypes: StatusType[];
	groups: Group[];
}

export async function fetchCalendarReportData(ctx: QueryWithRawStorePorts): Promise<CalendarReportData> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewReports);

	const orgId = ctx.auth.orgId;
	const scope = resolveCalendarGroupScope(ctx);

	const [allPersonnel, statusTypeRows, groups] = await Promise.all([
		requirePersonnelCalendarRoster(ctx).listActive(ctx.auth),
		ctx.store.findMany<Record<string, unknown>>('status_types', orgId, undefined, {
			select: StatusTypeEntity.select,
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		listGroupCatalog({ auth: ctx.auth, store: ctx.rawStore }, { groupIds: scope?.groupIds })
	]);

	return {
		allPersonnel,
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows),
		groups
	};
}

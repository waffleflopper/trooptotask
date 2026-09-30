import type { Personnel } from '$features/personnel/contracts';
import type { StatusType } from '$features/calendar/contracts';
import type { Group } from '$features/personnel/contracts';
import { listStatusTypes } from './statusTypeRead.server';
import { listGroupCatalog } from '$features/personnel/index.server';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from '$lib/server/core/useCases/calendarPolicy';
import { requirePersonnelCalendarRoster, resolveCalendarGroupScope } from '$lib/server/core/useCases/calendarScope';

type CalendarReportPorts = Parameters<typeof requireCalendarPolicy>[0] &
	Parameters<typeof requirePersonnelCalendarRoster>[0] & {
		store: Parameters<typeof listStatusTypes>[0];
		rawStore: Parameters<typeof listGroupCatalog>[0]['store'];
	};

export interface CalendarReportData {
	allPersonnel: Personnel[];
	statusTypes: StatusType[];
	groups: Group[];
}

export async function fetchCalendarReportData(ctx: CalendarReportPorts): Promise<CalendarReportData> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewReports);

	const orgId = ctx.auth.orgId;
	const scope = resolveCalendarGroupScope(ctx);

	const [allPersonnel, statusTypes, groups] = await Promise.all([
		requirePersonnelCalendarRoster(ctx).listActive(ctx.auth),
		listStatusTypes(ctx.store, orgId),
		listGroupCatalog({ auth: ctx.auth, store: ctx.rawStore }, { groupIds: scope?.groupIds })
	]);

	return {
		allPersonnel,
		statusTypes,
		groups
	};
}

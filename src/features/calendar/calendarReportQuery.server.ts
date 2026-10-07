import type { Personnel } from '$features/personnel/contracts';
import type { StatusType } from '$features/calendar/contracts';
import type { Group, GroupPersistence } from '$features/personnel/contracts';
import { listStatusTypes } from './statusTypeRead.server';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from '$lib/server/core/useCases/calendarPolicy';
import { requirePersonnelCalendarRoster, resolveCalendarGroupScope } from '$lib/server/core/useCases/calendarScope';

type CalendarReportPorts = Parameters<typeof requireCalendarPolicy>[0] &
	Parameters<typeof requirePersonnelCalendarRoster>[0] & {
		calendarCatalogs: Parameters<typeof listStatusTypes>[0];
		groups: Pick<GroupPersistence, 'listCatalog'>;
	};

export interface CalendarReportData {
	allPersonnel: Personnel[];
	statusTypes: StatusType[];
	groups: Group[];
}

export async function fetchCalendarReportData(ctx: CalendarReportPorts): Promise<CalendarReportData> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewReports);

	const scope = resolveCalendarGroupScope(ctx);

	const [allPersonnel, statusTypes, groups] = await Promise.all([
		requirePersonnelCalendarRoster(ctx).listActive(ctx.auth),
		listStatusTypes(ctx.calendarCatalogs),
		ctx.groups.listCatalog({ groupIds: scope?.groupIds })
	]);

	return {
		allPersonnel,
		statusTypes,
		groups
	};
}

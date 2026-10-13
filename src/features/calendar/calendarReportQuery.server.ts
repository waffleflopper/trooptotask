import type { Personnel } from '$features/personnel/contracts';
import type { StatusType } from '$features/calendar/contracts';
import type { Group, GroupPersistence } from '$features/personnel/contracts';
import type { AuditPort } from '$lib/audit/contracts';
import { listAssignmentTypes } from './assignmentTypeRead.server';
import { listAvailabilityEntries } from './availabilityRead.server';
import { listDailyAssignments } from './dailyAssignmentRead.server';
import { listStatusTypes } from './statusTypeRead.server';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy.server';
import { requirePersonnelCalendarRoster, resolveCalendarAssigneeScope } from './calendarScope.server';

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

	const [allPersonnel, statusTypes, groups] = await Promise.all([
		requirePersonnelCalendarRoster(ctx).listActive(ctx.auth),
		listStatusTypes(ctx.calendarCatalogs),
		ctx.groups.listCatalog()
	]);

	return {
		allPersonnel,
		statusTypes,
		groups
	};
}

type CalendarStatusDaysPorts = Parameters<typeof requireCalendarPolicy>[0] &
	Parameters<typeof resolveCalendarAssigneeScope>[0] &
	Parameters<typeof listAvailabilityEntries>[0] &
	Parameters<typeof listDailyAssignments>[0] & {
		calendarCatalogs: Parameters<typeof listAssignmentTypes>[0];
		audit: AuditPort;
	};

export async function fetchCalendarStatusDaysReport(
	ctx: CalendarStatusDaysPorts,
	range: { startDate: string; endDate: string }
) {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewReports);

	const scope = await resolveCalendarAssigneeScope(ctx);

	const [entries, assignments, assignmentTypes] = await Promise.all([
		listAvailabilityEntries(ctx, {
			rangeStart: range.startDate,
			rangeEnd: range.endDate,
			personnelIds: scope?.personnelIds
		}),
		listDailyAssignments(ctx, { rangeStart: range.startDate, rangeEnd: range.endDate }, scope),
		listAssignmentTypes(ctx.calendarCatalogs)
	]);

	ctx.audit.log({ action: 'calendar_report.viewed', resourceType: 'calendar_report' });

	return { entries, assignments, assignmentTypes };
}

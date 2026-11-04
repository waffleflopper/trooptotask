import type { Personnel } from '$features/personnel/contracts';
import type { CalendarCatalogPersistence, StatusType } from '$features/calendar/contracts';
import type { Group, GroupPersistence, OrganizationRankCatalogEntry } from '$features/personnel/contracts';
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
		loadRankCatalog: () => Promise<OrganizationRankCatalogEntry[]>;
	};

export interface CalendarReportData {
	allPersonnel: Personnel[];
	statusTypes: StatusType[];
	groups: Group[];
	/** The Organization's ranks, which a duty's rank range is read against. */
	rankCatalog: OrganizationRankCatalogEntry[];
}

export async function fetchCalendarReportData(ctx: CalendarReportPorts): Promise<CalendarReportData> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewReports);

	const [allPersonnel, statusTypes, groups, rankCatalog] = await Promise.all([
		requirePersonnelCalendarRoster(ctx).listActive(ctx.auth),
		listStatusTypes(ctx.calendarCatalogs),
		ctx.groups.listCatalog(),
		ctx.loadRankCatalog()
	]);

	return {
		allPersonnel,
		statusTypes,
		groups,
		rankCatalog
	};
}

type CalendarStatusDaysPorts = Parameters<typeof requireCalendarPolicy>[0] &
	Parameters<typeof resolveCalendarAssigneeScope>[0] &
	Parameters<typeof listAvailabilityEntries>[0] &
	Parameters<typeof listDailyAssignments>[0] & {
		calendarCatalogs: Parameters<typeof listAssignmentTypes>[0] &
			Pick<CalendarCatalogPersistence, 'listRosterExcusalSpans' | 'listRosterPoolSpans'>;
		audit: AuditPort;
	};

export async function fetchCalendarStatusDaysReport(
	ctx: CalendarStatusDaysPorts,
	range: { startDate: string; endDate: string }
) {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewReports);

	const scope = await resolveCalendarAssigneeScope(ctx);

	const [entries, assignments, assignmentTypes, excusals, poolSpans] = await Promise.all([
		listAvailabilityEntries(ctx, {
			rangeStart: range.startDate,
			rangeEnd: range.endDate,
			personnelIds: scope?.personnelIds
		}),
		listDailyAssignments(ctx, { rangeStart: range.startDate, rangeEnd: range.endDate }, scope),
		listAssignmentTypes(ctx.calendarCatalogs),
		// Includes people since reinstated, whom a type's open excusals leave out.
		ctx.calendarCatalogs.listRosterExcusalSpans({ from: range.startDate, through: range.endDate }),
		// A duty's pool rules change over time, so past days are shared by the pool of their own form.
		ctx.calendarCatalogs.listRosterPoolSpans({ from: range.startDate, through: range.endDate })
	]);
	const inScope = scope && new Set(scope.personnelIds);

	ctx.audit.log({ action: 'calendar_report.viewed', resourceType: 'calendar_report' });

	return {
		entries,
		assignments,
		assignmentTypes,
		excusals: inScope ? excusals.filter((excusal) => inScope.has(excusal.personId)) : excusals,
		poolSpans
	};
}

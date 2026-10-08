// Calendar feature barrel export

// Types
export type { StatusType, AvailabilityEntry, SpecialDay, AssignmentType, DailyAssignment } from './contracts';
export type {
	CalendarBootstrap,
	CalendarRangeData,
	CalendarWorkspaceResult,
	CalendarWorkspaceRestricted
} from './calendar.types';

// Web reads and workspace hydration for other features
export {
	calendarStatusSource,
	calendarAvailabilitySource,
	calendarAssignmentsSource,
	calendarStatusHydration,
	calendarAvailabilityHydration,
	calendarAssignmentsHydration
} from './webSources.svelte';

// Utils
export { getDefaultFederalHolidays } from './utils/federalHolidays';
export {
	exportMonthToExcel,
	printMonthCalendar,
	exportQuarterToExcel,
	printQuarterCalendar
} from './utils/calendarExport';

// Context
export { CalendarPageContext } from './contexts/CalendarPageContext.svelte';
export type { CalendarPageData, CalendarPageAccess } from './contexts/CalendarPageContext.svelte';
export { CalendarRangeCoordinator } from './contexts/CalendarRangeCoordinator.svelte';

// Route workspace state consumed by Delivery
export { calendarWorkspaceHydrator } from './calendarWorkspaceHydration.svelte';
export { calendarStore } from './stores/calendar.svelte';
export { dailyAssignmentsStore } from './stores/dailyAssignments.svelte';
export { buildCalendarAnchorCookie, CALENDAR_ANCHOR_COOKIE } from './utils/calendarAnchorDate';

// Route pages
export { default as CalendarPageView } from './components/CalendarPageView.svelte';
export { default as AssignmentPlannerPage } from './components/AssignmentPlannerPage.svelte';
export { default as BulkStatusPage } from './components/BulkStatusPage.svelte';
export { default as CalendarReports } from './components/reports/CalendarReports.svelte';
export { default as CalendarSettingsPage } from './components/CalendarSettingsPage.svelte';

export { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';

export type { CalendarOperationsPageAccess, CalendarSettingsPageAccess } from './contracts';

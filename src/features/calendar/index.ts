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

// Route workspace state consumed by Delivery
export { calendarStore } from './stores/calendar.svelte';
export { dailyAssignmentsStore } from './stores/dailyAssignments.svelte';
export { buildCalendarAnchorCookie, CALENDAR_ANCHOR_COOKIE } from './utils/calendarAnchorDate';
export { calendarReadRange, rangeCoversDate, rangeCoversSpan } from './utils/calendarRange';

// Routed page components are separate public files so each route loads only its own page.

export { CalendarStatusBadge } from './components/calendar-status-badge';

export type { CalendarOperationsPageAccess, CalendarSettingsPageAccess } from './contracts';

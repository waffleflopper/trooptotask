export type { StatusType, AvailabilityEntry, SpecialDay, AssignmentType, DailyAssignment } from './contracts';
export type {
	CalendarBootstrap,
	CalendarRangeData,
	CalendarWorkspaceResult,
	CalendarWorkspaceRestricted,
	PersonnelCalendarWindow
} from './calendar.types';

export {
	calendarStatusSource,
	calendarAvailabilitySource,
	calendarAssignmentsSource,
	calendarStatusHydration,
	calendarAvailabilityHydration,
	calendarAssignmentsHydration
} from './webSources.svelte';

export { getDefaultFederalHolidays } from './utils/federalHolidays';
export { exportMonthToExcel, exportQuarterToExcel } from './utils/calendarExport';

export { CalendarPageContext } from './contexts/CalendarPageContext.svelte';
export type { CalendarPageData, CalendarPageAccess } from './contexts/CalendarPageContext.svelte';

export { calendarStore } from './stores/calendar.svelte';
export { dailyAssignmentsStore } from './stores/dailyAssignments.svelte';
export { CALENDAR_ANCHOR_COOKIE } from './utils/calendarAnchorDate';
export { calendarViewCoverage, rangeCoversDate, rangeCoversSpan } from './utils/calendarRange';
export { assignmentSlotKey, indexAssignmentsBySlot, openAssignmentDates } from './utils/calendarIndexes';
export { calendarLaneTypes } from './utils/calendarLanes';

// Routed page components are separate public files so each route loads only its own page.

export { CalendarStatusBadge } from './components/calendar-status-badge';
export { default as PersonnelNextDays } from './components/PersonnelNextDays.svelte';
export { default as PersonnelNextDaysSkeleton } from './components/PersonnelNextDaysSkeleton.svelte';

export type { CalendarOperationsPageAccess, CalendarSettingsPageAccess } from './contracts';

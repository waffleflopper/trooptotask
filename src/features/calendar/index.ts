// Calendar feature barrel export

// Types
export type { StatusType, AvailabilityEntry, SpecialDay, AssignmentType, DailyAssignment } from './contracts';
export type { CalendarBootstrap, CalendarRangeData } from './calendar.types';

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
export type { CalendarPageData } from './contexts/CalendarPageContext.svelte';

// Components are imported directly from their paths:
// $features/calendar/components/CalendarPageView.svelte
// $features/calendar/components/Calendar.svelte
// $features/calendar/components/CalendarRow.svelte (moved from personnel/PersonnelRow)
// $features/calendar/components/CalendarHeader.svelte
// $lib/components/ui/date-cell (shared UI primitive)
// $features/calendar/components/AvailabilityModal.svelte
// $features/calendar/components/BulkStatusPage.svelte
// $features/calendar/components/BulkStatusAdd.svelte
// $features/calendar/components/BulkStatusRemove.svelte
// $features/calendar/components/BulkStatusImport.svelte
// $features/calendar/components/StatusLegend.svelte
// $features/calendar/components/DailyAssignmentModal.svelte
// $features/calendar/components/MonthlyAssignmentPlanner.svelte
// $features/calendar/components/LongRangeView.svelte

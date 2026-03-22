// Calendar feature barrel export

// Types
export type { StatusType, AvailabilityEntry, SpecialDay, AssignmentType, DailyAssignment } from '$lib/types';
export { DEFAULT_STATUS_TYPES } from '$lib/types';

// Stores
export { availabilityStore } from './stores/availability.svelte';
export { calendarStore } from './stores/calendar.svelte';
export { specialDaysStore } from './stores/specialDays.svelte';
export { statusTypesStore } from './stores/statusTypes.svelte';
export { dailyAssignmentsStore } from './stores/dailyAssignments.svelte';
export { calendarPrefsStore } from './stores/calendarPrefs.svelte';

// Utils
export { getDefaultFederalHolidays } from './utils/federalHolidays';
export { exportMonthToCSV, printMonthCalendar, exportQuarterToCSV, printQuarterCalendar } from './utils/calendarExport';

// Context
export { CalendarPageContext } from './contexts/CalendarPageContext.svelte';
export type { CalendarPageData } from './contexts/CalendarPageContext.svelte';

// Components are imported directly from their paths:
// $features/calendar/components/CalendarPageView.svelte
// $features/calendar/components/CalendarModals.svelte
// $features/calendar/components/Calendar.svelte
// $features/calendar/components/CalendarRow.svelte (moved from personnel/PersonnelRow)
// $features/calendar/components/CalendarHeader.svelte
// $lib/components/ui/DateCell.svelte (moved to shared UI primitives)
// $features/calendar/components/AvailabilityModal.svelte
// $features/calendar/components/StatusTypeManager.svelte
// $features/calendar/components/SpecialDayManager.svelte
// $features/calendar/components/BulkStatusModal.svelte
// $features/calendar/components/BulkStatusRemoveModal.svelte
// $features/calendar/components/TodayBreakdown.svelte
// $features/calendar/components/StatusLegend.svelte
// $features/calendar/components/PersonStatusModal.svelte
// $features/calendar/components/DailyAssignmentModal.svelte
// $features/calendar/components/AssignmentTypeManager.svelte
// $features/calendar/components/MonthlyAssignmentPlanner.svelte
// $features/calendar/components/LongRangeView.svelte

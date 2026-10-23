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
export type {
	AvailabilityEditorRequest,
	CalendarPageData,
	CalendarPageAccess
} from './contexts/CalendarPageContext.svelte';
export { saveAvailabilityChange, type AvailabilityOutcome } from './availabilitySave';
export type { AvailabilityChange } from './utils/availabilityMutation';

/** The status editor, loaded on first open. */
export function loadAvailabilityModal() {
	return import('./components/AvailabilityModal.svelte');
}

export { calendarStore } from './stores/calendar.svelte';
export { dailyAssignmentsStore } from './stores/dailyAssignments.svelte';
export { CALENDAR_ANCHOR_COOKIE } from './utils/calendarAnchorDate';
export { calendarViewCoverage, rangeCoversDate, rangeCoversSpan } from './utils/calendarRange';
export { da6Href } from './utils/da6View';
export type { Da6View } from './utils/da6View';
export { assignmentSlotKey, indexAssignmentsBySlot, openAssignmentDates } from './utils/calendarIndexes';
export { calendarLaneTypes } from './utils/calendarLanes';
export { indexDutyAvailability } from './utils/dutyReadModel';
export { isFreeForDuty, planDutyFill, type DutyFillSlot } from './utils/dutyFill';
export type { DutyPickerOption } from './utils/dutyPickerOptions';
export { PlannerRosterRead } from './contexts/PlannerRosterRead.svelte';

/** The duty picker popover, loaded when a slot first opens it. */
export function loadDutyPicker() {
	return import('./components/DutyPicker.svelte');
}

// Routed page components are separate public files so each route loads only its own page.

export { CalendarStatusBadge } from './components/calendar-status-badge';
export { default as PersonnelNextDays } from './components/PersonnelNextDays.svelte';
export { default as PersonnelNextDaysSkeleton } from './components/PersonnelNextDaysSkeleton.svelte';

export type { CalendarOperationsPageAccess, CalendarSettingsPageAccess } from './contracts';

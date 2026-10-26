export type { StatusType, AvailabilityEntry, SpecialDay, AssignmentType, DailyAssignment } from './contracts';
export type {
	CalendarProjection,
	CalendarProjectionRead,
	ProjectedCommitment,
	ProjectedEvent,
	ProjectedSuspense
} from './projection/calendarProjection';
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
export { da6Href, da6SetupHref } from './utils/da6View';
export type { Da6Setup, Da6View } from './utils/da6View';
export { assignmentSlotKey, indexAssignmentsBySlot, openAssignmentDates } from './utils/calendarIndexes';
export { calendarLaneTypes } from './utils/calendarLanes';
export { indexDutyAvailability } from './utils/dutyReadModel';
export { isFreeForDuty, planDutyFill, type DutyFillSlot } from './utils/dutyFill';
export { dutyPickerOptions, type DutyPickerOption } from './utils/dutyPickerOptions';
export { CalendarRangeCoordinator } from './contexts/CalendarRangeCoordinator.svelte';
export { PlannerRosterRead, previewRosterFill } from './contexts/PlannerRosterRead.svelte';
export { rosterSkipNote } from './utils/plannerRosters';
export { trackOf } from './roster/rosterCalendar';

/** The duty picker popover, loaded when a slot first opens it. */
export function loadDutyPicker() {
	return import('./components/DutyPicker.svelte');
}

// Routed page components are separate public files so each route loads only its own page.

export { CalendarStatusBadge } from './components/calendar-status-badge';
export { default as PersonnelNextDays } from './components/PersonnelNextDays.svelte';
export { default as PersonnelNextDaysSkeleton } from './components/PersonnelNextDaysSkeleton.svelte';
export { default as Da6SetupPage } from './components/da6/Da6SetupPage.svelte';

export type { CalendarEventsPageAccess, CalendarOperationsPageAccess, CalendarSettingsPageAccess } from './contracts';
export type {
	CalendarEvent,
	EventActivity,
	EventDetail,
	EventHost,
	EventList,
	EventListWhen,
	EventRead,
	MemberLabels
} from './events/eventModel';
export type {
	Tasking,
	TaskingActivityLog,
	TaskingChoices,
	TaskingDetail,
	TaskingList,
	TaskingListScope,
	TaskingResponsibility
} from './taskings/taskingModel';
export type {
	ChecklistItem,
	EquipmentRequirement,
	TaskingListKind,
	TaskingLists,
	TaskingReadiness
} from './taskings/taskingListsModel';
/** The Assign people picker, loaded on first open. */
export function loadAssignPeopleDialog() {
	return import('./taskings/staffing/components/AssignPeopleDialog.svelte');
}
export { parseTaskingFilters, parseTaskingView, scopeOfView } from './taskings/taskingModel';
export type { TaskingStaffing } from './taskings/staffing/staffingModel';
export type {
	TaskingAttentionProjection,
	TaskingAttentionKind,
	TaskingAttentionRow
} from './taskings/taskingAttentionModel';
export { createStatusImportLane, type StatusImportColumns, type StatusImportSource } from './import/statusImportLane';

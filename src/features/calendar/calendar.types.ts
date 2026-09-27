import type { AvailabilityEntry, DailyAssignment, Personnel, SpecialDay } from '$lib/types';

/** Response shape for the browser's Calendar range request. */
export interface CalendarRangeData {
	rangeStart: string;
	rangeEnd: string;
	availabilityEntries: AvailabilityEntry[];
	specialDays: SpecialDay[];
	dailyAssignments: DailyAssignment[];
}

export interface CalendarWorkspaceData {
	rangeStart?: string;
	rangeEnd?: string;
	personnel: Personnel[];
	allPersonnel?: Personnel[];
	activeOnboardingPersonnelIds?: string[];
	/** Org-configured loss warning window in days (default: 180). */
	lossWarningWindowDays?: number;
}

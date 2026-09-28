import type { DailyAssignment, Personnel } from '$lib/types';
import type { AssignmentType, AvailabilityEntry, SpecialDay, StatusType } from '$features/calendar/contracts';
import type { Group } from '$features/personnel/contracts';

export interface CalendarBootstrap {
	rangeStart: string;
	rangeEnd: string;
	availabilityEntries: AvailabilityEntry[] | Promise<AvailabilityEntry[]>;
	specialDays: SpecialDay[] | Promise<SpecialDay[]>;
	assignmentTypes: AssignmentType[];
	dailyAssignments: DailyAssignment[] | Promise<DailyAssignment[]>;
	pinnedGroups: string[];
	personnel: Personnel[];
	groups: Group[];
	statusTypes: StatusType[];
	activeOnboardingPersonnelIds: string[];
	/** Org-configured loss warning window in days (default: 180). */
	lossWarningWindowDays: number;
}

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

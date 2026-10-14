import type { Personnel } from '$features/personnel/contracts';
import type {
	AssignmentType,
	AvailabilityEntry,
	CalendarDateRange,
	SpecialDay,
	StatusType,
	DailyAssignment
} from '$features/calendar/contracts';
import type { Group } from '$features/personnel/contracts';

export interface CalendarBootstrap {
	rangeStart: string;
	rangeEnd: string;
	availabilityEntries: AvailabilityEntry[] | Promise<AvailabilityEntry[]>;
	specialDays: SpecialDay[] | Promise<SpecialDay[]>;
	/** Special Days come from a wider catalog window than the availability and assignment range. */
	specialDaysRange: CalendarDateRange;
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

export const CALENDAR_WORKSPACE_LANE_KEY = 'calendar' as const;

export type CalendarWorkspaceHydrationMode = 'replace' | 'preserve-client';

export interface CalendarWorkspaceHydrationTarget<T> {
	mode: CalendarWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	items: T[] | Promise<T[]>;
}

/** A snapshot that is authoritative only within its date range. */
export interface CalendarRangeHydrationTarget<T> {
	mode: 'range' | 'preserve-client';
	deferred?: boolean;
	snapshotKey: string;
	items: T[] | Promise<T[]>;
	range: CalendarDateRange;
}

export interface CalendarAssignmentsHydrationItems {
	types: AssignmentType[];
	assignments: DailyAssignment[];
}

export interface CalendarAssignmentsWorkspaceHydrationTarget {
	mode: 'range' | 'preserve-client';
	deferred?: boolean;
	snapshotKey: string;
	items: CalendarAssignmentsHydrationItems | Promise<CalendarAssignmentsHydrationItems>;
	range: CalendarDateRange;
}

export interface CalendarWorkspaceHydration {
	orgId: string;
	personnel: CalendarWorkspaceHydrationTarget<Personnel>;
	groups: CalendarWorkspaceHydrationTarget<Group>;
	statusTypes: CalendarWorkspaceHydrationTarget<StatusType>;
	availabilityEntries: CalendarRangeHydrationTarget<AvailabilityEntry>;
	specialDays: CalendarRangeHydrationTarget<SpecialDay>;
	calendarAssignments: CalendarAssignmentsWorkspaceHydrationTarget;
	pinnedGroups: CalendarWorkspaceHydrationTarget<string>;
}

export interface CalendarWorkspaceResult {
	laneKey: typeof CALENDAR_WORKSPACE_LANE_KEY;
	data: CalendarBootstrap;
	hydration: CalendarWorkspaceHydration;
}

export interface CalendarWorkspaceRestricted {
	laneKey: typeof CALENDAR_WORKSPACE_LANE_KEY;
	access: 'restricted';
}

export interface CalendarWorkspaceRouteData {
	[CALENDAR_WORKSPACE_LANE_KEY]: { data: Promise<CalendarWorkspaceResult | CalendarWorkspaceRestricted> };
}

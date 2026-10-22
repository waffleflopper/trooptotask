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
	/** The assignment span: the visible days. */
	rangeStart: string;
	rangeEnd: string;
	/** Availability covers the visible days, and back to today when today falls shortly before them. */
	availabilityRange: CalendarDateRange;
	availabilityEntries: AvailabilityEntry[] | Promise<AvailabilityEntry[]>;
	specialDays: SpecialDay[] | Promise<SpecialDay[]>;
	/** Special Days come from a wider catalog window than the availability and assignment spans. */
	specialDaysRange: CalendarDateRange;
	assignmentTypes: AssignmentType[];
	dailyAssignments: DailyAssignment[] | Promise<DailyAssignment[]>;
	pinnedGroups: string[];
	personnel: Personnel[];
	groups: Group[];
	statusTypes: StatusType[];
	activeOnboardingPersonnelIds: string[];
	/** Org-configured loss warning window in days; `null` when the setting could not be read. */
	lossWarningWindowDays: number | null;
}

/** Response shape for the browser's Calendar range request; each requested collection is present. */
export interface CalendarRangeData {
	rangeStart: string;
	rangeEnd: string;
	availabilityEntries?: AvailabilityEntry[];
	specialDays?: SpecialDay[];
	dailyAssignments?: DailyAssignment[];
}

export interface CalendarWorkspaceData {
	rangeStart?: string;
	rangeEnd?: string;
	availabilityRange?: CalendarDateRange;
	personnel: Personnel[];
	allPersonnel?: Personnel[];
	activeOnboardingPersonnelIds?: string[];
	/** Org-configured loss warning window in days; `null` when the setting could not be read. */
	lossWarningWindowDays?: number | null;
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
	/** Each tab's latest confirmed change when the request left; see `confirmedBeforeRequest`. */
	confirmedChangesByTab: Record<string, number>;
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

/** One Person's Calendar over a date range, with only the catalog rows its entries use. */
export interface PersonnelCalendarWindow extends CalendarDateRange {
	availability: AvailabilityEntry[];
	statusTypes: StatusType[];
	/** The Person's own slots and their Group's. */
	assignments: DailyAssignment[];
	assignmentTypes: AssignmentType[];
	specialDays: SpecialDay[];
}

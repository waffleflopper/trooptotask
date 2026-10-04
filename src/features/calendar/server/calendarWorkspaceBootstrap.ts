import {
	createCompositeWorkspaceSnapshotKey,
	createWorkspaceHydrationTarget,
	createWorkspaceValueHydrationTarget,
	isPromiseLike,
	type DeferredData,
	type HydrationItems,
	type WorkspaceHydrationTarget,
	type WorkspaceValueHydrationTarget
} from '$lib/server/core/streamedWorkspace';
import { type CalendarBootstrap } from '../calendar.types';
import type { Personnel } from '$features/personnel/contracts';
import type {
	AssignmentType,
	AvailabilityEntry,
	DailyAssignment,
	SpecialDay,
	StatusType
} from '$features/calendar/contracts';
import type { Group } from '$features/personnel/contracts';

export const CALENDAR_WORKSPACE_LANE_KEY = 'calendar' as const;

export type CalendarWorkspaceData = CalendarBootstrap;

export type CalendarWorkspaceHydrationMode = 'replace' | 'merge' | 'preserve-client';

export type CalendarWorkspaceHydrationTarget<T> = WorkspaceHydrationTarget<T, CalendarWorkspaceHydrationMode>;

export interface CalendarAssignmentsWorkspaceHydrationTarget extends WorkspaceValueHydrationTarget<
	CalendarAssignmentsHydrationItems,
	CalendarWorkspaceHydrationMode
> {
	rangeStart?: string;
	rangeEnd?: string;
}

export interface CalendarAssignmentsHydrationItems {
	types: AssignmentType[];
	assignments: DailyAssignment[];
}

export interface CalendarWorkspaceHydration {
	orgId: string;
	personnel: CalendarWorkspaceHydrationTarget<Personnel>;
	groups: CalendarWorkspaceHydrationTarget<Group>;
	statusTypes: CalendarWorkspaceHydrationTarget<StatusType>;
	availabilityEntries: CalendarWorkspaceHydrationTarget<AvailabilityEntry>;
	specialDays: CalendarWorkspaceHydrationTarget<SpecialDay>;
	calendarAssignments: CalendarAssignmentsWorkspaceHydrationTarget;
	pinnedGroups: CalendarWorkspaceHydrationTarget<string>;
}

export interface CalendarWorkspaceResult {
	laneKey: typeof CALENDAR_WORKSPACE_LANE_KEY;
	data: CalendarWorkspaceData;
	hydration: CalendarWorkspaceHydration;
}

export interface CalendarWorkspaceRestricted {
	laneKey: typeof CALENDAR_WORKSPACE_LANE_KEY;
	access: 'restricted';
}

export interface CalendarWorkspaceRouteData {
	[CALENDAR_WORKSPACE_LANE_KEY]: DeferredData<CalendarWorkspaceResult | CalendarWorkspaceRestricted>;
}

function createCalendarHydrationTarget<T>(
	items: HydrationItems<T>,
	mode: CalendarWorkspaceHydrationMode = 'replace'
): CalendarWorkspaceHydrationTarget<T> {
	return createWorkspaceHydrationTarget(items, { mode, resolvedSnapshotKey: 'json' });
}

function createCalendarAssignmentsItems(
	assignmentTypes: AssignmentType[],
	dailyAssignments: DailyAssignment[] | Promise<DailyAssignment[]>
): CalendarAssignmentsHydrationItems | Promise<CalendarAssignmentsHydrationItems> {
	if (isPromiseLike(dailyAssignments)) {
		return dailyAssignments.then((assignments) => ({
			types: assignmentTypes,
			assignments
		}));
	}

	return {
		types: assignmentTypes,
		assignments: dailyAssignments
	};
}

function createCalendarAssignmentsHydrationTarget(
	data: CalendarWorkspaceData
): CalendarAssignmentsWorkspaceHydrationTarget {
	const items = createCalendarAssignmentsItems(data.assignmentTypes, data.dailyAssignments);
	const target = createWorkspaceValueHydrationTarget(items, { mode: 'merge', resolvedSnapshotKey: 'json' });

	return {
		...target,
		snapshotKey: createCompositeWorkspaceSnapshotKey(
			{
				assignmentTypes: data.assignmentTypes,
				dailyAssignments: data.dailyAssignments,
				rangeStart: data.rangeStart,
				rangeEnd: data.rangeEnd
			},
			{ resolved: 'json' }
		),
		rangeStart: data.rangeStart,
		rangeEnd: data.rangeEnd
	};
}

export function createCalendarWorkspaceHydration(
	orgId: string,
	data: CalendarWorkspaceData
): CalendarWorkspaceHydration {
	return {
		orgId,
		personnel: createCalendarHydrationTarget(data.personnel),
		groups: createCalendarHydrationTarget(data.groups),
		statusTypes: createCalendarHydrationTarget(data.statusTypes),
		availabilityEntries: createCalendarHydrationTarget(data.availabilityEntries, 'merge'),
		specialDays: createCalendarHydrationTarget(data.specialDays, 'merge'),
		calendarAssignments: createCalendarAssignmentsHydrationTarget(data),
		pinnedGroups: createCalendarHydrationTarget(data.pinnedGroups)
	};
}

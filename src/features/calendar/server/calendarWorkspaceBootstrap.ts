import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
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
import {
	fetchCalendarBootstrap,
	getActiveOnboardingPersonnelIds,
	type CalendarBootstrap,
	type CalendarDateRange
} from '$lib/server/core/useCases/calendarQuery';
import { withCalendarTiming } from '$lib/server/utils/calendarTiming';
import { CALENDAR_ANCHOR_COOKIE, resolveCalendarAnchorDate } from '$features/calendar/utils/calendarAnchorDate';
import { createInitialCalendarBufferedRange } from '$features/calendar/utils/calendarRange';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, SpecialDay, StatusType } from '$lib/types';
import type { Group } from '$features/personnel/contracts';

export const CALENDAR_WORKSPACE_LANE_KEY = 'calendar' as const;

export interface CalendarWorkspaceRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
	specialDaysRange?: CalendarDateRange;
}

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

export interface CalendarWorkspaceRouteData {
	[CALENDAR_WORKSPACE_LANE_KEY]: DeferredData<CalendarWorkspaceResult>;
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

function createCalendarWorkspaceHydration(orgId: string, data: CalendarWorkspaceData): CalendarWorkspaceHydration {
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

export async function streamCalendarWorkspaceBootstrap(
	context: CalendarWorkspaceRequestContext
): Promise<CalendarWorkspaceRouteData> {
	const deferred = await loadWithContext(context.locals, context.cookies, context.orgId, {
		policyAction: POLICY_ACTION_CATALOG.calendar.viewAvailability,
		policyResource: { kind: 'unscoped' },
		defer: true,
		fn: async (ctx) => {
			const anchorDate = resolveCalendarAnchorDate(context.cookies.get(CALENDAR_ANCHOR_COOKIE), new Date());
			const { rangeStart, rangeEnd } = createInitialCalendarBufferedRange(anchorDate);
			const data = await withCalendarTiming(context.orgId, 'workspace-bootstrap', async () => {
				const [calendarData, activeOnboardingPersonnelIds] = await Promise.all([
					fetchCalendarBootstrap(ctx, {
						rangeStart,
						rangeEnd,
						specialDaysRange: context.specialDaysRange
					}),
					getActiveOnboardingPersonnelIds(ctx)
				]);

				return {
					...calendarData,
					activeOnboardingPersonnelIds
				};
			});

			return {
				laneKey: CALENDAR_WORKSPACE_LANE_KEY,
				data,
				hydration: createCalendarWorkspaceHydration(ctx.auth.orgId, data)
			} satisfies CalendarWorkspaceResult;
		}
	});

	return {
		calendar: deferred
	};
}

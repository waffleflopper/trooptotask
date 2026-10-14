import type { FeatureLaneWorkspaceRequestContext } from '$lib/server/adapters/featureLaneWorkspaceLoad';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarWorkspaceContext } from '$lib/server/adapters/requestContexts.server';
import {
	createCompositeWorkspaceSnapshotKey,
	createWorkspaceHydrationTarget,
	createWorkspaceValueHydrationTarget,
	isPromiseLike,
	settleWorkspaceDenial,
	type HydrationItems
} from '$lib/server/adapters/streamedWorkspace';
import {
	fetchCalendarBootstrap,
	getActiveOnboardingPersonnelIds,
	CALENDAR_WORKSPACE_LANE_KEY,
	type CalendarAssignmentsHydrationItems,
	type CalendarAssignmentsWorkspaceHydrationTarget,
	type CalendarBootstrap,
	type CalendarDateRange,
	type CalendarRangeHydrationTarget,
	type CalendarWorkspaceHydration,
	type CalendarWorkspaceHydrationTarget,
	type CalendarWorkspaceRouteData,
	type CalendarWorkspaceResult
} from '$features/calendar/index.server';
import type { AssignmentType, DailyAssignment } from '$features/calendar/contracts';
import { withCalendarTiming } from '$features/calendar/index.server';
import { CALENDAR_ANCHOR_COOKIE, resolveCalendarAnchorDate } from '$features/calendar/index.server';
import { createInitialCalendarBufferedRange } from '$features/calendar/index.server';

function createCalendarHydrationTarget<T>(items: HydrationItems<T>): CalendarWorkspaceHydrationTarget<T> {
	return createWorkspaceHydrationTarget(items, { mode: 'replace', resolvedSnapshotKey: 'json' });
}

function createCalendarRangeHydrationTarget<T>(
	items: HydrationItems<T>,
	range: CalendarDateRange
): CalendarRangeHydrationTarget<T> {
	return {
		...createWorkspaceHydrationTarget(items, { mode: 'range', resolvedSnapshotKey: 'json' }),
		snapshotKey: createCompositeWorkspaceSnapshotKey({ items, range }, { resolved: 'json' }),
		range
	};
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
	data: CalendarBootstrap
): CalendarAssignmentsWorkspaceHydrationTarget {
	const items = createCalendarAssignmentsItems(data.assignmentTypes, data.dailyAssignments);
	const target = createWorkspaceValueHydrationTarget(items, { mode: 'range', resolvedSnapshotKey: 'json' });

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
		range: { rangeStart: data.rangeStart, rangeEnd: data.rangeEnd }
	};
}

export function createCalendarWorkspaceHydration(orgId: string, data: CalendarBootstrap): CalendarWorkspaceHydration {
	return {
		orgId,
		personnel: createCalendarHydrationTarget(data.personnel),
		groups: createCalendarHydrationTarget(data.groups),
		statusTypes: createCalendarHydrationTarget(data.statusTypes),
		availabilityEntries: createCalendarRangeHydrationTarget(data.availabilityEntries, {
			rangeStart: data.rangeStart,
			rangeEnd: data.rangeEnd
		}),
		specialDays: createCalendarRangeHydrationTarget(data.specialDays, data.specialDaysRange),
		calendarAssignments: createCalendarAssignmentsHydrationTarget(data),
		pinnedGroups: createCalendarHydrationTarget(data.pinnedGroups)
	};
}

function createSpecialDaysCatalogRange(anchorDate: Date, today: Date): CalendarDateRange {
	const years = [anchorDate.getFullYear(), today.getFullYear()];
	return {
		rangeStart: `${Math.min(...years) - 1}-01-01`,
		rangeEnd: `${Math.max(...years) + 2}-12-31`
	};
}

export async function streamCalendarWorkspaceBootstrap(
	context: FeatureLaneWorkspaceRequestContext
): Promise<CalendarWorkspaceRouteData> {
	const deferred = await loadWithContext(context.locals, context.cookies, context.orgId, {
		context: createRequestCalendarWorkspaceContext,
		policyAction: POLICY_ACTION_CATALOG.calendar.viewAvailability,
		policyResource: { kind: 'unscoped' },
		defer: true,
		fn: async (ctx) => {
			const today = new Date();
			const anchorDate = resolveCalendarAnchorDate(context.cookies.get(CALENDAR_ANCHOR_COOKIE), today);
			const { rangeStart, rangeEnd } = createInitialCalendarBufferedRange(anchorDate);
			const data = await withCalendarTiming(context.orgId, 'workspace-bootstrap', async () => {
				const [calendarData, activeOnboardingPersonnelIds] = await Promise.all([
					fetchCalendarBootstrap(ctx, {
						rangeStart,
						rangeEnd,
						specialDaysRange: createSpecialDaysCatalogRange(anchorDate, today)
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
		calendar: { data: settleWorkspaceDenial(deferred.data, CALENDAR_WORKSPACE_LANE_KEY) }
	};
}

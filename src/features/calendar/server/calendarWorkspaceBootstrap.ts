import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { DeferredData, HydrationItems } from '$lib/server/core/streamedWorkspace';
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
import type { Group } from '$lib/stores/groups.svelte';

export const CALENDAR_WORKSPACE_LANE_KEY = 'calendar' as const;

export interface CalendarWorkspaceRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
	specialDaysRange?: CalendarDateRange;
}

export type CalendarWorkspaceData = CalendarBootstrap;

export type CalendarWorkspaceHydrationMode = 'replace' | 'merge' | 'preserve-client';

export interface CalendarWorkspaceHydrationTarget<T> {
	mode: CalendarWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	items: HydrationItems<T>;
}

export interface CalendarAssignmentsWorkspaceHydrationTarget {
	mode: CalendarWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	rangeStart?: string;
	rangeEnd?: string;
	items: CalendarAssignmentsHydrationItems | Promise<CalendarAssignmentsHydrationItems>;
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

const deferredSnapshotKeys = new WeakMap<object, string>();
let fallbackSnapshotCounter = 0;

function isPromiseLike<T>(value: unknown): value is Promise<T> {
	return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

function generateSnapshotId(prefix: string): string {
	const randomId = globalThis.crypto?.randomUUID?.();
	if (randomId) {
		return `${prefix}:${randomId}`;
	}

	fallbackSnapshotCounter = (fallbackSnapshotCounter + 1) % 1_000_000;
	return `${prefix}:fallback:${fallbackSnapshotCounter}`;
}

function createSnapshotKey(value: unknown): string {
	if (isPromiseLike(value)) {
		let key = deferredSnapshotKeys.get(value);
		if (!key) {
			key = generateSnapshotId('deferred');
			deferredSnapshotKeys.set(value, key);
		}
		return key;
	}

	try {
		return `resolved:${JSON.stringify(value)}`;
	} catch {
		return generateSnapshotId('resolved:fallback');
	}
}

function createCompositeSnapshotKey(parts: Record<string, unknown>): string {
	return createSnapshotKey(
		Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, createSnapshotKey(value)]))
	);
}

function createCalendarHydrationTarget<T>(
	items: HydrationItems<T>,
	mode: CalendarWorkspaceHydrationMode = 'replace'
): CalendarWorkspaceHydrationTarget<T> {
	return {
		mode,
		deferred: isPromiseLike(items),
		snapshotKey: createSnapshotKey(items),
		items
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
	data: CalendarWorkspaceData
): CalendarAssignmentsWorkspaceHydrationTarget {
	const items = createCalendarAssignmentsItems(data.assignmentTypes, data.dailyAssignments);

	return {
		mode: 'merge',
		deferred: isPromiseLike(items),
		snapshotKey: createCompositeSnapshotKey({
			assignmentTypes: data.assignmentTypes,
			dailyAssignments: data.dailyAssignments,
			rangeStart: data.rangeStart,
			rangeEnd: data.rangeEnd
		}),
		rangeStart: data.rangeStart,
		rangeEnd: data.rangeEnd,
		items
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

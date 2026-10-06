import { isHttpError, type Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarWorkspaceContext } from '$lib/server/adapters/requestContexts.server';
import {
	fetchCalendarBootstrap,
	getActiveOnboardingPersonnelIds,
	createCalendarWorkspaceHydration,
	CALENDAR_WORKSPACE_LANE_KEY,
	type CalendarDateRange,
	type CalendarWorkspaceRouteData,
	type CalendarWorkspaceResult
} from '$features/calendar/index.server';
import { withCalendarTiming } from '$features/calendar/index.server';
import { CALENDAR_ANCHOR_COOKIE, resolveCalendarAnchorDate } from '$features/calendar/index.server';
import { createInitialCalendarBufferedRange } from '$features/calendar/index.server';

export interface CalendarWorkspaceRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
	specialDaysRange?: CalendarDateRange;
}

export async function streamCalendarWorkspaceBootstrap(
	context: CalendarWorkspaceRequestContext
): Promise<CalendarWorkspaceRouteData> {
	const deferred = await loadWithContext(context.locals, context.cookies, context.orgId, {
		context: createRequestCalendarWorkspaceContext,
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
		calendar: {
			data: deferred.data.catch((cause: unknown) => {
				if (isHttpError(cause, 403)) {
					return { laneKey: CALENDAR_WORKSPACE_LANE_KEY, access: 'restricted' } as const;
				}
				throw cause;
			})
		}
	};
}

import {
	listEventContributions,
	listTaskingActivity,
	loadTaskingPickStates,
	loadTaskingChoices,
	loadTaskingAvailabilityGaps,
	loadTaskingDetail,
	loadTaskingStaffing,
	loadTaskingLists,
	settleEventRead
} from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarTaskingContext } from '$lib/server/adapters/requestContexts.server';
import { viewerToday } from '$lib/server/viewerDay.server';
import { VIEWER_DAY_DEPENDENCY } from '$lib/utils/viewerTimeZone';
import type { PageServerLoadEvent } from './$types';

export const load = async ({ params, locals, cookies, depends }: PageServerLoadEvent) => {
	depends('app:org-core', 'app:calendar-events', VIEWER_DAY_DEPENDENCY);
	const today = viewerToday(cookies);

	return loadWithContext(locals, cookies, params.orgId, {
		context: createRequestCalendarTaskingContext,
		policyAction: POLICY_ACTION_CATALOG.calendar.viewEvents,
		policyResource: { kind: 'unscoped' },
		fn: async (ctx) => {
			const detail = loadTaskingDetail(ctx, params.taskingId);
			return {
			today,
			pickStates: settleEventRead(loadTaskingPickStates(ctx, params.taskingId)),
			detail: settleEventRead(detail),
			// The Event is known only once the Tasking is read; the counts follow it on the server, not the browser.
			restOfEvent: settleEventRead(
				detail.then(({ tasking }) =>
					tasking.event ? listEventContributions(ctx, tasking.event.id, tasking.id) : []
				)
			),
			activity: settleEventRead(listTaskingActivity(ctx, params.taskingId)),
			people: settleEventRead(loadTaskingStaffing(ctx, params.taskingId)),
			availabilityGaps: settleEventRead(loadTaskingAvailabilityGaps(ctx, params.taskingId)),
			lists: settleEventRead(loadTaskingLists(ctx, params.taskingId)),
			choices: settleEventRead(loadTaskingChoices(ctx, today))
			};
		}
	});
};

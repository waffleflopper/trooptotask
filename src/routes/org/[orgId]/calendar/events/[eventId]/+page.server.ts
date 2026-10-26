import {
	listEventActivity,
	listEventTaskings,
	listEventTaskingSummaries,
	loadEventDetail,
	loadTaskingChoices,
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
		fn: async (ctx) => ({
			today,
			detail: settleEventRead(loadEventDetail(ctx, params.eventId)),
			activity: settleEventRead(listEventActivity(ctx, params.eventId)),
			taskings: settleEventRead(listEventTaskings(ctx, params.eventId)),
			taskingSummaries: settleEventRead(listEventTaskingSummaries(ctx, params.eventId)),
			taskingChoices: settleEventRead(loadTaskingChoices(ctx, today))
		})
	});
};

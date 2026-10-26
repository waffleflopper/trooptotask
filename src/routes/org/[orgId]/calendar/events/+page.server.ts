import type { EventListWhen } from '$features/calendar';
import { listEvents, loadTaskingChoices, settleEventRead } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarTaskingContext } from '$lib/server/adapters/requestContexts.server';
import { viewerToday } from '$lib/server/viewerDay.server';
import { VIEWER_DAY_DEPENDENCY } from '$lib/utils/viewerTimeZone';
import type { PageServerLoadEvent } from './$types';

export const load = async ({ params, locals, cookies, depends, url }: PageServerLoadEvent) => {
	depends('app:org-core', 'app:calendar-events', VIEWER_DAY_DEPENDENCY);
	const today = viewerToday(cookies);
	const when: EventListWhen = url.searchParams.get('when') === 'past' ? 'past' : 'upcoming';

	return loadWithContext(locals, cookies, params.orgId, {
		context: createRequestCalendarTaskingContext,
		policyAction: POLICY_ACTION_CATALOG.calendar.viewEvents,
		policyResource: { kind: 'unscoped' },
		fn: async (ctx) => ({
			today,
			when,
			workspace: settleEventRead(ctx.taskingWorkspace.read(today)),
			list: settleEventRead(listEvents(ctx, when, today)),
			choices: settleEventRead(loadTaskingChoices(ctx, today))
		})
	});
};

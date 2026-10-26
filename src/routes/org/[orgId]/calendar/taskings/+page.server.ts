import { listTaskings, loadEventMembers, loadTaskingChoices, settleEventRead } from '$features/calendar/index.server';
import { parseTaskingView, scopeOfView } from '$features/calendar';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarTaskingContext } from '$lib/server/adapters/requestContexts.server';
import { viewerToday } from '$lib/server/viewerDay.server';
import { VIEWER_DAY_DEPENDENCY } from '$lib/utils/viewerTimeZone';
import type { PageServerLoadEvent } from './$types';

export const load = async ({ params, locals, cookies, depends, url }: PageServerLoadEvent) => {
	depends('app:org-core', 'app:calendar-events', VIEWER_DAY_DEPENDENCY);
	const today = viewerToday(cookies);
	// Only the view picks what loads; the other filters narrow it on the page, so typing a search never refetches.
	const scope = scopeOfView(parseTaskingView(url.searchParams));

	return loadWithContext(locals, cookies, params.orgId, {
		context: createRequestCalendarTaskingContext,
		policyAction: POLICY_ACTION_CATALOG.calendar.viewEvents,
		policyResource: { kind: 'unscoped' },
		fn: async (ctx) => ({
			today,
			workspace: settleEventRead(ctx.taskingWorkspace.read(today)),
			list: settleEventRead(listTaskings(ctx, scope)),
			choices: settleEventRead(loadTaskingChoices(ctx, today)),
			eventMembers: settleEventRead(loadEventMembers(ctx))
		})
	});
};

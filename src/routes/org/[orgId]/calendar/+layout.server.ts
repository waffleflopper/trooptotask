import type { LayoutServerLoad } from './$types';
import { loadOrgWorkspace } from '$lib/server/core/useCases/loadOrgWorkspace';
import { createSupabaseCalendarWorkspacePort } from '$lib/server/adapters/supabaseOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { CalendarBootstrap } from '$lib/server/core/useCases/calendarQuery';

export const load: LayoutServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:calendar-data');
	const { orgId } = params;

	return {
		calendar: await loadOrgWorkspace<CalendarBootstrap>(
			'calendar',
			createSupabaseCalendarWorkspacePort(locals, cookies, orgId),
			createDefaultHydrationPlanner(orgId)
		)
	};
};

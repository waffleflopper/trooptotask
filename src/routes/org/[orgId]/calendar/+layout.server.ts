import type { Cookies } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { createSupabaseCalendarWorkspacePort } from '$lib/server/adapters/supabaseOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { HydrationPlannerPort, OrgWorkspacePort } from '$lib/server/core/orgShell';
import { createOrgShellCoordinator, type OrgShellCoordinator } from '$lib/server/core/orgShellCoordinator';
import type { CalendarBootstrap } from '$lib/server/core/useCases/calendarQuery';

interface CalendarLayoutRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

export interface CalendarLayoutLoadDeps {
	coordinator?: OrgShellCoordinator;
	createWorkspacePort?: (context: CalendarLayoutRequestContext) => OrgWorkspacePort;
	createPlannerPort?: (orgId: string) => HydrationPlannerPort;
}

export function _createCalendarLayoutLoad(deps: CalendarLayoutLoadDeps = {}): LayoutServerLoad {
	const coordinator = deps.coordinator ?? createOrgShellCoordinator();
	const createWorkspacePort =
		deps.createWorkspacePort ??
		(({ locals, cookies, orgId }: CalendarLayoutRequestContext) =>
			createSupabaseCalendarWorkspacePort(locals, cookies, orgId));
	const createPlannerPort = deps.createPlannerPort ?? createDefaultHydrationPlanner;

	return async ({ params, locals, cookies, depends }) => {
		depends('app:org-core', 'app:calendar-data');

		const { orgId } = params;
		const workspacePort = createWorkspacePort({ locals, cookies, orgId });
		const plannerPort = createPlannerPort(orgId);

		return coordinator.loadWorkspace<CalendarBootstrap, 'calendar'>('calendar', {
			workspace: workspacePort,
			planner: plannerPort
		});
	};
}

export const load: LayoutServerLoad = _createCalendarLayoutLoad();

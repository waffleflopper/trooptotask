import type { Cookies } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { createSupabaseCalendarWorkspacePort } from '$lib/server/adapters/supabaseOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { HydrationPlannerPort, StreamableOrgWorkspacePort } from '$lib/server/core/orgShell';
import { createOrgShellCoordinator, type OrgShellCoordinator } from '$lib/server/core/orgShellCoordinator';
import type { CalendarBootstrap, CalendarDateRange } from '$lib/server/core/useCases/calendarQuery';

interface CalendarLayoutRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
	specialDaysRange?: CalendarDateRange;
}

export interface CalendarLayoutLoadDeps {
	coordinator?: OrgShellCoordinator;
	createWorkspacePort?: (context: CalendarLayoutRequestContext) => StreamableOrgWorkspacePort;
	createPlannerPort?: (orgId: string) => HydrationPlannerPort;
}

export function _createCalendarLayoutLoad(deps: CalendarLayoutLoadDeps = {}): LayoutServerLoad {
	const coordinator = deps.coordinator ?? createOrgShellCoordinator();
	const createWorkspacePort =
		deps.createWorkspacePort ??
		(({ locals, cookies, orgId, specialDaysRange }: CalendarLayoutRequestContext) =>
			createSupabaseCalendarWorkspacePort(locals, cookies, orgId, { specialDaysRange }));
	const createPlannerPort = deps.createPlannerPort ?? createDefaultHydrationPlanner;

	return async ({ params, locals, cookies, url, depends }) => {
		depends('app:org-core', 'app:calendar-data');

		const { orgId } = params;
		const requestContext: CalendarLayoutRequestContext = { locals, cookies, orgId };
		if (isCalendarSettingsPath(url.pathname)) {
			requestContext.specialDaysRange = createCalendarSettingsSpecialDaysRange(new Date());
		}
		const workspacePort = createWorkspacePort(requestContext);
		const plannerPort = createPlannerPort(orgId);

		return coordinator.streamWorkspace<CalendarBootstrap, 'calendar'>('calendar', {
			workspace: workspacePort,
			planner: plannerPort
		});
	};
}

function isCalendarSettingsPath(pathname: string): boolean {
	return pathname.replace(/\/$/, '').endsWith('/calendar/settings');
}

function createCalendarSettingsSpecialDaysRange(anchorDate: Date): CalendarDateRange {
	const year = anchorDate.getFullYear();
	return {
		rangeStart: `${year - 1}-01-01`,
		rangeEnd: `${year + 2}-12-31`
	};
}

export const load: LayoutServerLoad = _createCalendarLayoutLoad();

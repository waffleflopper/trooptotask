import type { Cookies } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { createSupabaseCriticalTasksWorkspacePort } from '$lib/server/adapters/supabaseOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { HydrationPlannerPort, OrgWorkspacePort } from '$lib/server/core/orgShell';
import { createOrgShellCoordinator, type OrgShellCoordinator } from '$lib/server/core/orgShellCoordinator';
import type { CriticalTasksBootstrap } from '$lib/server/core/orgShell';
import { requireReadyAppShell } from '$lib/server/core/appShellRouteData';

interface CriticalTasksLayoutRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

export interface CriticalTasksLayoutLoadDeps {
	coordinator?: OrgShellCoordinator;
	createWorkspacePort?: (context: CriticalTasksLayoutRequestContext) => OrgWorkspacePort;
	createPlannerPort?: (orgId: string) => HydrationPlannerPort;
}

export function _createCriticalTasksLayoutLoad(deps: CriticalTasksLayoutLoadDeps = {}): LayoutServerLoad {
	const coordinator = deps.coordinator ?? createOrgShellCoordinator();
	const createWorkspacePort =
		deps.createWorkspacePort ??
		(({ locals, cookies, orgId }: CriticalTasksLayoutRequestContext) =>
			createSupabaseCriticalTasksWorkspacePort(locals, cookies, orgId));
	const createPlannerPort = deps.createPlannerPort ?? createDefaultHydrationPlanner;

	return async ({
		locals,
		cookies,
		depends,
		parent
	}: {
		locals: App.Locals;
		cookies: Cookies;
		depends: (...deps: string[]) => void;
		parent: () => Promise<Parameters<typeof requireReadyAppShell>[0]>;
	}) => {
		depends('app:org-core', 'app:critical-tasks-data');

		const shell = requireReadyAppShell(await parent());
		const orgId = shell.org.id;
		const workspacePort = createWorkspacePort({ locals, cookies, orgId });
		const plannerPort = createPlannerPort(orgId);
		const workspace = await coordinator.loadWorkspace<CriticalTasksBootstrap, 'critical-tasks'>('critical-tasks', {
			workspace: workspacePort,
			planner: plannerPort
		});

		return {
			criticalTasks: workspace['critical-tasks']
		};
	};
}

export const load: LayoutServerLoad = _createCriticalTasksLayoutLoad();

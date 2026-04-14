import type { Cookies } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { createSupabaseCriticalTasksWorkspacePort } from '$lib/server/adapters/supabaseOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { HydrationPlannerPort, StreamableOrgWorkspacePort } from '$lib/server/core/orgShell';
import { createOrgShellCoordinator, type OrgShellCoordinator } from '$lib/server/core/orgShellCoordinator';
import type { CriticalTasksBootstrap } from '$lib/server/core/useCases/criticalTasksQuery';

interface CriticalTasksLayoutRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

export interface CriticalTasksLayoutLoadDeps {
	coordinator?: OrgShellCoordinator;
	createWorkspacePort?: (context: CriticalTasksLayoutRequestContext) => StreamableOrgWorkspacePort;
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
		params,
		locals,
		cookies,
		depends
	}: {
		params: { orgId: string };
		locals: App.Locals;
		cookies: Cookies;
		depends: (...deps: string[]) => void;
	}) => {
		depends('app:org-core', 'app:critical-tasks-data');

		const { orgId } = params;
		const workspacePort = createWorkspacePort({ locals, cookies, orgId });
		const plannerPort = createPlannerPort(orgId);
		const streamed = await coordinator.streamWorkspace<CriticalTasksBootstrap, 'critical-tasks'>('critical-tasks', {
			workspace: workspacePort,
			planner: plannerPort
		});

		return {
			criticalTasks: streamed['critical-tasks']
		};
	};
}

export const load: LayoutServerLoad = _createCriticalTasksLayoutLoad();

import type { Cookies } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { createSupabasePersonnelWorkspacePort } from '$lib/server/adapters/supabaseOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { HydrationPlannerPort, OrgWorkspacePort } from '$lib/server/core/orgShell';
import { createOrgShellCoordinator, type OrgShellCoordinator } from '$lib/server/core/orgShellCoordinator';
import type { PersonnelBootstrap } from '$lib/server/core/useCases/personnelWorkspaceQuery';

interface PersonnelLayoutRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

export interface PersonnelLayoutLoadDeps {
	coordinator?: OrgShellCoordinator;
	createWorkspacePort?: (context: PersonnelLayoutRequestContext) => OrgWorkspacePort;
	createPlannerPort?: (orgId: string) => HydrationPlannerPort;
}

export function _createPersonnelLayoutLoad(deps: PersonnelLayoutLoadDeps = {}): LayoutServerLoad {
	const coordinator = deps.coordinator ?? createOrgShellCoordinator();
	const createWorkspacePort =
		deps.createWorkspacePort ??
		(({ locals, cookies, orgId }: PersonnelLayoutRequestContext) =>
			createSupabasePersonnelWorkspacePort(locals, cookies, orgId));
	const createPlannerPort = deps.createPlannerPort ?? createDefaultHydrationPlanner;

	return async ({ params, locals, cookies, depends }) => {
		depends('app:org-core', 'app:personnel-data');

		const { orgId } = params;
		const workspacePort = createWorkspacePort({ locals, cookies, orgId });
		const plannerPort = createPlannerPort(orgId);

		return coordinator.loadWorkspace<PersonnelBootstrap, 'personnel'>('personnel', {
			workspace: workspacePort,
			planner: plannerPort
		});
	};
}

export const load: LayoutServerLoad = _createPersonnelLayoutLoad();

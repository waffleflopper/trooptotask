import type { Cookies } from '@sveltejs/kit';
import type { WorkspaceKey, OrgWorkspacePort, HydrationPlannerPort } from '../orgShell';
import {
	createSupabaseCalendarWorkspacePort,
	createSupabaseOnboardingWorkspacePort,
	createSupabasePersonnelWorkspacePort,
	createSupabaseTrainingWorkspacePort,
	createSupabaseDashboardWorkspacePort
} from '$lib/server/adapters/supabaseOrgShell';
import { createDefaultHydrationPlanner } from '../hydrationPlanner';
import { loadOrgWorkspaceRouteData } from './loadOrgWorkspaceRouteData';

export interface OrgLayoutLoadSpec<TWorkspace, K extends WorkspaceKey = WorkspaceKey> {
	workspace: K;
	depends?: readonly string[];
	workspacePort?: OrgWorkspacePort;
	plannerPort?: HydrationPlannerPort;
}

function createSupabaseWorkspacePort(
	workspace: WorkspaceKey,
	locals: App.Locals,
	cookies: Cookies,
	orgId: string
): OrgWorkspacePort {
	switch (workspace) {
		case 'calendar':
			return createSupabaseCalendarWorkspacePort(locals, cookies, orgId);
		case 'onboarding':
			return createSupabaseOnboardingWorkspacePort(locals, cookies, orgId);
		case 'personnel':
			return createSupabasePersonnelWorkspacePort(locals, cookies, orgId);
		case 'training':
			return createSupabaseTrainingWorkspacePort(locals, cookies, orgId);
		case 'dashboard':
			return createSupabaseDashboardWorkspacePort(locals, cookies, orgId);
	}
}

export function createOrgLayoutLoad<TWorkspace, K extends WorkspaceKey = WorkspaceKey>(
	spec: OrgLayoutLoadSpec<TWorkspace, K>
) {
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
		for (const dependency of spec.depends ?? []) {
			depends(dependency);
		}

		const { orgId } = params;
		const workspacePort = spec.workspacePort ?? createSupabaseWorkspacePort(spec.workspace, locals, cookies, orgId);
		const plannerPort = spec.plannerPort ?? createDefaultHydrationPlanner(orgId);

		return loadOrgWorkspaceRouteData<TWorkspace, K>(spec.workspace, workspacePort, plannerPort);
	};
}

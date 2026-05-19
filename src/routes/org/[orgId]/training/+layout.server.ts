import type { Cookies } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { createSupabaseTrainingWorkspacePort } from '$lib/server/adapters/supabaseOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { HydrationPlannerPort, StreamableOrgWorkspacePort } from '$lib/server/core/orgShell';
import { createOrgShellCoordinator, type OrgShellCoordinator } from '$lib/server/core/orgShellCoordinator';
import type { TrainingBootstrap } from '$lib/server/core/orgShell';

interface TrainingLayoutRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

export interface TrainingLayoutLoadDeps {
	coordinator?: OrgShellCoordinator;
	createWorkspacePort?: (context: TrainingLayoutRequestContext) => StreamableOrgWorkspacePort;
	createPlannerPort?: (orgId: string) => HydrationPlannerPort;
}

export function _createTrainingLayoutLoad(deps: TrainingLayoutLoadDeps = {}): LayoutServerLoad {
	const coordinator = deps.coordinator ?? createOrgShellCoordinator();
	const createWorkspacePort =
		deps.createWorkspacePort ??
		(({ locals, cookies, orgId }: TrainingLayoutRequestContext) =>
			createSupabaseTrainingWorkspacePort(locals, cookies, orgId));
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
		parent: () => Promise<{ orgId: string }>;
	}) => {
		depends('app:org-core', 'app:training-data');

		const { orgId } = await parent();
		const workspacePort = createWorkspacePort({ locals, cookies, orgId });
		const plannerPort = createPlannerPort(orgId);

		return coordinator.streamWorkspace<TrainingBootstrap, 'training'>('training', {
			workspace: workspacePort,
			planner: plannerPort
		});
	};
}

export const load: LayoutServerLoad = _createTrainingLayoutLoad();

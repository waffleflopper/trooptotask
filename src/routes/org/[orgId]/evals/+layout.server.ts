import type { Cookies } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { createSupabaseRatingSchemeWorkspacePort } from '$lib/server/adapters/supabaseOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { HydrationPlannerPort, OrgWorkspacePort } from '$lib/server/core/orgShell';
import { createOrgShellCoordinator, type OrgShellCoordinator } from '$lib/server/core/orgShellCoordinator';
import type { RatingSchemeBootstrap } from '$lib/server/core/useCases/personnelWorkspaceQuery';

interface EvalsLayoutRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

export interface EvalsLayoutLoadDeps {
	coordinator?: OrgShellCoordinator;
	createWorkspacePort?: (context: EvalsLayoutRequestContext) => OrgWorkspacePort;
	createPlannerPort?: (orgId: string) => HydrationPlannerPort;
}

export function _createEvalsLayoutLoad(deps: EvalsLayoutLoadDeps = {}): LayoutServerLoad {
	const coordinator = deps.coordinator ?? createOrgShellCoordinator();
	const createWorkspacePort =
		deps.createWorkspacePort ??
		(({ locals, cookies, orgId }: EvalsLayoutRequestContext) =>
			createSupabaseRatingSchemeWorkspacePort(locals, cookies, orgId));
	const createPlannerPort = deps.createPlannerPort ?? createDefaultHydrationPlanner;

	return async ({ params, locals, cookies, depends }) => {
		depends('app:org-core', 'app:rating-scheme-data');

		const { orgId } = params;
		const workspacePort = createWorkspacePort({ locals, cookies, orgId });
		const plannerPort = createPlannerPort(orgId);

		const result = await coordinator.loadWorkspace<RatingSchemeBootstrap, 'rating-scheme'>('rating-scheme', {
			workspace: workspacePort,
			planner: plannerPort
		});

		return { ratingScheme: result['rating-scheme'] };
	};
}

export const load: LayoutServerLoad = _createEvalsLayoutLoad();

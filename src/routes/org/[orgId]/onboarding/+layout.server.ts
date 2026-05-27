import type { Cookies } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseOnboardingWorkspacePort } from '$lib/server/adapters/supabaseOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { HydrationPlannerPort, StreamableOrgWorkspacePort } from '$lib/server/core/orgShell';
import { createOrgShellCoordinator, type OrgShellCoordinator } from '$lib/server/core/orgShellCoordinator';
import type { OnboardingBootstrap } from '$lib/server/core/useCases/onboardingQuery';

interface OnboardingLayoutRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

export interface OnboardingLayoutLoadDeps {
	coordinator?: OrgShellCoordinator;
	createWorkspacePort?: (context: OnboardingLayoutRequestContext) => StreamableOrgWorkspacePort;
	createPlannerPort?: (orgId: string) => HydrationPlannerPort;
	authorizeAccess?: (context: OnboardingLayoutRequestContext) => Promise<void>;
}

export function _createOnboardingLayoutLoad(deps: OnboardingLayoutLoadDeps = {}): LayoutServerLoad {
	const coordinator = deps.coordinator ?? createOrgShellCoordinator();
	const createWorkspacePort =
		deps.createWorkspacePort ??
		(({ locals, cookies, orgId }: OnboardingLayoutRequestContext) =>
			createSupabaseOnboardingWorkspacePort(locals, cookies, orgId));
	const createPlannerPort = deps.createPlannerPort ?? createDefaultHydrationPlanner;
	const authorizeAccess =
		deps.authorizeAccess ??
		((context: OnboardingLayoutRequestContext) =>
			loadWithContext(context.locals, context.cookies, context.orgId, {
				policyAction: POLICY_ACTION_CATALOG.onboarding.viewWorkflows,
				fn: async () => undefined
			}));

	return async ({ params, locals, cookies, depends }) => {
		depends('app:org-core', 'app:onboarding-data');

		const { orgId } = params;
		await authorizeAccess({ locals, cookies, orgId });
		const workspacePort = createWorkspacePort({ locals, cookies, orgId });
		const plannerPort = createPlannerPort(orgId);

		return coordinator.streamWorkspace<OnboardingBootstrap, 'onboarding'>('onboarding', {
			workspace: workspacePort,
			planner: plannerPort
		});
	};
}

export const load: LayoutServerLoad = _createOnboardingLayoutLoad();

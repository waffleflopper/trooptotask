import type { LayoutServerLoad } from './$types';
import { loadOrgWorkspace } from '$lib/server/core/useCases/loadOrgWorkspace';
import { createSupabaseOnboardingWorkspacePort } from '$lib/server/adapters/supabaseOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { OnboardingBootstrap } from '$lib/server/core/useCases/onboardingQuery';

export const load: LayoutServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:onboarding-data');
	const { orgId } = params;

	return {
		onboarding: await loadOrgWorkspace<OnboardingBootstrap>(
			'onboarding',
			createSupabaseOnboardingWorkspacePort(locals, cookies, orgId),
			createDefaultHydrationPlanner(orgId)
		)
	};
};

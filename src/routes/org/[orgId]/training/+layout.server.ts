import type { LayoutServerLoad } from './$types';
import { loadOrgWorkspace } from '$lib/server/core/useCases/loadOrgWorkspace';
import { createSupabaseTrainingWorkspacePort } from '$lib/server/adapters/supabaseOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { TrainingBootstrap } from '$lib/server/core/useCases/trainingQuery';

export const load: LayoutServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:org-core');
	depends('app:training-data');
	const { orgId } = params;

	return {
		training: await loadOrgWorkspace<TrainingBootstrap>(
			'training',
			createSupabaseTrainingWorkspacePort(locals, cookies, orgId),
			createDefaultHydrationPlanner(orgId)
		)
	};
};

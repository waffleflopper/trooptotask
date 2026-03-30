import type { LayoutServerLoad } from './$types';
import { loadOrgWorkspace } from '$lib/server/core/useCases/loadOrgWorkspace';
import { createSupabasePersonnelWorkspacePort } from '$lib/server/adapters/supabaseOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { PersonnelBootstrap } from '$lib/server/core/useCases/personnelWorkspaceQuery';

export const load: LayoutServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:personnel-data');
	const { orgId } = params;

	return {
		personnel: await loadOrgWorkspace<PersonnelBootstrap>(
			'personnel',
			createSupabasePersonnelWorkspacePort(locals, cookies, orgId),
			createDefaultHydrationPlanner(orgId)
		)
	};
};

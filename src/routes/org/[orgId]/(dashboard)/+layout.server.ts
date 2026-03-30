import type { LayoutServerLoad } from './$types';
import { loadOrgWorkspace } from '$lib/server/core/useCases/loadOrgWorkspace';
import { createSupabaseDashboardWorkspacePort } from '$lib/server/adapters/supabaseOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';

export const load: LayoutServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:org-core');
	depends('app:dashboard-data');
	const { orgId } = params;

	return {
		dashboard: await loadOrgWorkspace<DashboardBootstrap>(
			'dashboard',
			createSupabaseDashboardWorkspacePort(locals, cookies, orgId),
			createDefaultHydrationPlanner(orgId)
		)
	};
};

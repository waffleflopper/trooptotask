import type { LayoutServerLoad } from './$types';
import { createOrgLayoutLoad } from '$lib/server/core/useCases/createOrgLayoutLoad';
import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';

export const load: LayoutServerLoad = createOrgLayoutLoad<DashboardBootstrap>({
	workspace: 'dashboard',
	depends: ['app:org-core', 'app:dashboard-data']
});

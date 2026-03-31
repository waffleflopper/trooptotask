import type { LayoutServerLoad } from './$types';
import { createOrgLayoutLoad } from '$lib/server/core/useCases/createOrgLayoutLoad';
import type { PersonnelBootstrap } from '$lib/server/core/useCases/personnelWorkspaceQuery';

export const load: LayoutServerLoad = createOrgLayoutLoad<PersonnelBootstrap>({
	workspace: 'personnel',
	depends: ['app:org-core', 'app:personnel-data']
});

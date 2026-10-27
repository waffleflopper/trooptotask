import { requireActiveOrganization } from '$features/organization/index.server';
import type { PersonnelWorkspaceRouteData } from '$features/personnel/contracts';
import type { LayoutServerLoad } from './$types';
import { streamPersonnelWorkspace, type PersonnelWorkspaceRequest } from './personnelWorkspaceStream.server';

export interface PersonnelLayoutLoadDeps {
	streamPersonnelWorkspace?: (request: PersonnelWorkspaceRequest) => Promise<PersonnelWorkspaceRouteData>;
}

export function _createPersonnelLayoutLoad(deps: PersonnelLayoutLoadDeps = {}): LayoutServerLoad {
	return async (event) => {
		event.depends('app:org-core', 'app:personnel-data');
		// parent() would rerun the root and Organization loads on every Personnel refresh. Awaiting the shared
		// per-request admission instead keeps a suspended or unknown Organization failing as the shell does.
		await requireActiveOrganization(event.locals, event.params.orgId);
		return (deps.streamPersonnelWorkspace ?? streamPersonnelWorkspace)(event);
	};
}

export const load: LayoutServerLoad = _createPersonnelLayoutLoad();

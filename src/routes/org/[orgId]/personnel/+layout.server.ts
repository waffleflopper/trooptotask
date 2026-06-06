import type { LayoutServerLoad } from './$types';
import {
	streamReadyFeatureLaneWorkspace,
	type FeatureLaneWorkspaceRequestContext
} from '$lib/server/core/featureLaneWorkspaceLoad';
import {
	streamPersonnelWorkspaceBootstrap,
	type PersonnelWorkspaceRouteData
} from '$features/personnel/server/personnelWorkspaceBootstrap';

export interface PersonnelLayoutLoadDeps {
	streamPersonnelWorkspace?: (context: FeatureLaneWorkspaceRequestContext) => Promise<PersonnelWorkspaceRouteData>;
}

export function _createPersonnelLayoutLoad(deps: PersonnelLayoutLoadDeps = {}): LayoutServerLoad {
	const streamPersonnelWorkspace = deps.streamPersonnelWorkspace ?? streamPersonnelWorkspaceBootstrap;

	return async (event) =>
		streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:personnel-data'],
			streamWorkspace: streamPersonnelWorkspace
		});
}

export const load: LayoutServerLoad = _createPersonnelLayoutLoad();

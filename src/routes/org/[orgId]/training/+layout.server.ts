import type { LayoutServerLoad } from './$types';
import {
	streamReadyFeatureLaneWorkspace,
	type FeatureLaneWorkspaceRequestContext
} from '$lib/server/core/featureLaneWorkspaceLoad';
import {
	streamTrainingWorkspaceBootstrap,
	type TrainingWorkspaceRouteData
} from '$features/training/server/trainingWorkspaceBootstrap';

export interface TrainingLayoutLoadDeps {
	streamTrainingWorkspace?: (context: FeatureLaneWorkspaceRequestContext) => Promise<TrainingWorkspaceRouteData>;
}

export function _createTrainingLayoutLoad(deps: TrainingLayoutLoadDeps = {}): LayoutServerLoad {
	const streamTrainingWorkspace = deps.streamTrainingWorkspace ?? streamTrainingWorkspaceBootstrap;

	return async (event) =>
		streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:training-data'],
			streamWorkspace: streamTrainingWorkspace
		});
}

export const load: LayoutServerLoad = _createTrainingLayoutLoad();

import type { LayoutServerLoad } from './$types';
import {
	streamReadyFeatureLaneWorkspace,
	type FeatureLaneWorkspaceRequestContext
} from '$lib/server/core/featureLaneWorkspaceLoad';
import { streamTrainingWorkspaceBootstrap, type TrainingWorkspaceRouteData } from './trainingWorkspace.server';

export interface TrainingLayoutLoadDeps {
	streamTrainingWorkspace?: (context: FeatureLaneWorkspaceRequestContext) => Promise<TrainingWorkspaceRouteData>;
}

function isReportsPath(pathname: string): boolean {
	return pathname.replace(/\/+$/, '').endsWith('/training/reports');
}

export function _createTrainingLayoutLoad(deps: TrainingLayoutLoadDeps = {}): LayoutServerLoad {
	const streamTrainingWorkspace = deps.streamTrainingWorkspace ?? streamTrainingWorkspaceBootstrap;

	return async (event) =>
		streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:training-data'],
			streamWorkspace: async (context) =>
				isReportsPath(event.url.pathname) ? { training: undefined } : streamTrainingWorkspace(context)
		});
}

export const load: LayoutServerLoad = _createTrainingLayoutLoad();

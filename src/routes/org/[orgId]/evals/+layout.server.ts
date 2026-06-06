import type { LayoutServerLoad } from './$types';
import {
	streamReadyFeatureLaneWorkspace,
	type FeatureLaneWorkspaceRequestContext
} from '$lib/server/core/featureLaneWorkspaceLoad';
import {
	streamRatingSchemeWorkspaceBootstrap,
	type RatingSchemeWorkspaceRouteData
} from '$features/rating-scheme/server/ratingSchemeWorkspaceBootstrap';

export interface EvalsLayoutLoadDeps {
	streamRatingSchemeWorkspace?: (
		context: FeatureLaneWorkspaceRequestContext
	) => Promise<RatingSchemeWorkspaceRouteData>;
}

export function _createEvalsLayoutLoad(deps: EvalsLayoutLoadDeps = {}): LayoutServerLoad {
	const streamRatingSchemeWorkspace = deps.streamRatingSchemeWorkspace ?? streamRatingSchemeWorkspaceBootstrap;

	return async (event) =>
		streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:rating-scheme-data'],
			streamWorkspace: streamRatingSchemeWorkspace
		});
}

export const load: LayoutServerLoad = _createEvalsLayoutLoad();

import { createRequestRatingSchemeWorkspaceContext } from '$lib/server/adapters/featureRequestContexts.server';
import type { LayoutServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createWorkspaceHydrationTarget, settleWorkspaceDenial } from '$lib/server/adapters/streamedWorkspace';
import {
	streamReadyFeatureLaneWorkspace,
	type FeatureLaneWorkspaceRequestContext
} from '$lib/server/adapters/featureLaneWorkspaceLoad';
import { requireFeatureOn } from '$lib/server/adapters/featureSwitchRoute';
import { loadRatingSchemeWorkspace } from '$features/rating-scheme/index.server';
import {
	RATING_SCHEME_WORKSPACE_LANE_KEY,
	type RatingSchemeWorkspaceRouteData,
	type RatingSchemeWorkspaceResult
} from '$features/rating-scheme/contracts';

/** Delivery owns streaming and translates only explicit access denial. */
export async function _streamRatingSchemeWorkspace(
	context: FeatureLaneWorkspaceRequestContext
): Promise<RatingSchemeWorkspaceRouteData> {
	const deferred = await loadWithContext(context.locals, context.cookies, context.orgId, {
		context: createRequestRatingSchemeWorkspaceContext,
		policyAction: POLICY_ACTION_CATALOG.ratingScheme.viewEntries,
		policyResource: { kind: 'unscoped' },
		defer: true,
		fn: async (ctx) => {
			const data = await loadRatingSchemeWorkspace(ctx);
			return {
				laneKey: RATING_SCHEME_WORKSPACE_LANE_KEY,
				data,
				hydration: {
					orgId: ctx.auth.orgId,
					ratingSchemeEntries: createWorkspaceHydrationTarget(data.ratingSchemeEntries, {
						mode: 'replace',
						resolvedSnapshotKey: 'hash'
					})
				}
			} satisfies RatingSchemeWorkspaceResult;
		}
	});
	return {
		ratingScheme: { data: settleWorkspaceDenial(deferred.data, RATING_SCHEME_WORKSPACE_LANE_KEY) }
	};
}

export interface EvalsLayoutLoadDeps {
	streamRatingSchemeWorkspace?: (
		context: FeatureLaneWorkspaceRequestContext
	) => Promise<RatingSchemeWorkspaceRouteData>;
}

export function _createEvalsLayoutLoad(deps: EvalsLayoutLoadDeps = {}): LayoutServerLoad {
	const streamRatingSchemeWorkspace = deps.streamRatingSchemeWorkspace ?? _streamRatingSchemeWorkspace;

	return async (event) => {
		await requireFeatureOn(event, 'evaluations');
		return streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:rating-scheme-data'],
			streamWorkspace: streamRatingSchemeWorkspace
		});
	};
}

export const load: LayoutServerLoad = _createEvalsLayoutLoad();

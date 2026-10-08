import { createRequestRatingSchemeWorkspaceContext } from '$lib/server/adapters/featureRequestContexts.server';
import type { LayoutServerLoad } from './$types';
import { isHttpError } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createWorkspaceHydrationTarget } from '$lib/server/adapters/streamedWorkspace';
import {
	streamReadyFeatureLaneWorkspace,
	type FeatureLaneWorkspaceRequestContext
} from '$lib/server/adapters/featureLaneWorkspaceLoad';
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
						resolvedSnapshotKey: 'json'
					})
				}
			} satisfies RatingSchemeWorkspaceResult;
		}
	});
	return {
		ratingScheme: {
			data: deferred.data.catch((cause: unknown) => {
				if (isHttpError(cause, 403))
					return { laneKey: RATING_SCHEME_WORKSPACE_LANE_KEY, access: 'restricted' } as const;
				throw cause;
			})
		}
	};
}

export interface EvalsLayoutLoadDeps {
	streamRatingSchemeWorkspace?: (
		context: FeatureLaneWorkspaceRequestContext
	) => Promise<RatingSchemeWorkspaceRouteData>;
}

export function _createEvalsLayoutLoad(deps: EvalsLayoutLoadDeps = {}): LayoutServerLoad {
	const streamRatingSchemeWorkspace = deps.streamRatingSchemeWorkspace ?? _streamRatingSchemeWorkspace;

	return async (event) =>
		streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:rating-scheme-data'],
			streamWorkspace: streamRatingSchemeWorkspace
		});
}

export const load: LayoutServerLoad = _createEvalsLayoutLoad();

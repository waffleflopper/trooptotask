import {
	createRequestTrainingBriefingContext,
	createRequestTrainingRosterContext
} from '$lib/server/adapters/featureRequestContexts.server';
import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import {
	createWorkspaceHydrationTarget,
	createWorkspaceValueHydrationTarget,
	settleWorkspaceDenial,
	type DeferredData,
	type HydrationItems
} from '$lib/server/adapters/streamedWorkspace';
import {
	TRAINING_WORKSPACE_LANE_KEY,
	type TrainingWorkspaceData,
	type TrainingWorkspaceHydration,
	type TrainingWorkspaceHydrationTarget,
	type TrainingWorkspaceRestricted,
	type TrainingWorkspaceResult
} from '$features/training/contracts';
import { fetchTrainingWorkspaceData } from '$features/training/index.server';
import { fail } from '$lib/errors';
import { viewerToday } from '$lib/server/viewerDay.server';

export interface TrainingWorkspaceRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}
export interface TrainingWorkspaceRouteData {
	training: DeferredData<TrainingWorkspaceResult | TrainingWorkspaceRestricted>;
}

function createTrainingHydrationTarget<T>(items: HydrationItems<T>): TrainingWorkspaceHydrationTarget<T> {
	return createWorkspaceHydrationTarget(items, { mode: 'replace', resolvedSnapshotKey: 'hash' });
}

function createTrainingWorkspaceHydration(orgId: string, data: TrainingWorkspaceData): TrainingWorkspaceHydration {
	const hydration: TrainingWorkspaceHydration = {
		orgId,
		personnel: createTrainingHydrationTarget(data.personnel),
		groups: createTrainingHydrationTarget(data.groups),
		trainingTypes: createTrainingHydrationTarget(data.trainingTypes),
		trainingViews: createTrainingHydrationTarget(data.trainingViews),
		personnelTrainings: createTrainingHydrationTarget(data.personnelTrainings),
		pinnedGroups: createTrainingHydrationTarget(data.pinnedGroups)
	};
	if (data.rankCatalog) {
		hydration.rankCatalog = createTrainingHydrationTarget(data.rankCatalog);
	}
	if (data.readiness) {
		hydration.readiness = createWorkspaceValueHydrationTarget(data.readiness, { mode: 'replace' });
	}
	return hydration;
}

export async function streamTrainingWorkspaceBootstrap(
	context: TrainingWorkspaceRequestContext
): Promise<TrainingWorkspaceRouteData> {
	const readinessAsOf = viewerToday(context.cookies);
	const deferred = await loadWithContext(context.locals, context.cookies, context.orgId, {
		context: (request) => ({
			...createRequestTrainingRosterContext(request),
			organizationSettings: createRequestTrainingBriefingContext(request).organizationSettings
		}),
		policyAction: POLICY_ACTION_CATALOG.training.viewMatrix,
		policyResource: { kind: 'unscoped' },
		defer: true,
		fn: async (ctx) => {
			const data: TrainingWorkspaceData = {
				...fetchTrainingWorkspaceData(ctx, context.orgId),
				readiness: ctx.organizationSettings.findTrainingBriefingContext(ctx.auth.orgId).then((organization) => {
					if (!organization) fail(404, 'Organization not found');
					return { readinessGoalPercent: organization.trainingReadinessGoalPercent, readinessAsOf };
				})
			};
			return {
				laneKey: TRAINING_WORKSPACE_LANE_KEY,
				data,
				hydration: createTrainingWorkspaceHydration(ctx.auth.orgId, data)
			} satisfies TrainingWorkspaceResult;
		}
	});

	return {
		training: { data: settleWorkspaceDenial(deferred.data, TRAINING_WORKSPACE_LANE_KEY) }
	};
}

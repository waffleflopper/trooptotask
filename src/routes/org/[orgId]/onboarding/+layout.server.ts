import { createRequestOnboardingWorkspaceContext } from '$lib/server/adapters/featureRequestContexts.server';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { OnboardingWorkspaceRouteData } from '$features/onboarding/contracts';
import type { LayoutServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG, policyEvaluator } from '$lib/access/policyEvaluator';
import {
	streamReadyFeatureLaneWorkspace,
	type FeatureLaneWorkspaceRequestContext
} from '$lib/server/adapters/featureLaneWorkspaceLoad';
import { fetchOnboardingWorkspace } from '$features/onboarding/index.server';

async function streamOnboardingWorkspaceBootstrap(
	context: FeatureLaneWorkspaceRequestContext
): Promise<OnboardingWorkspaceRouteData> {
	const onboarding = await loadWithContext(context.locals, context.cookies, context.orgId, {
		context: createRequestOnboardingWorkspaceContext,
		policyAction: POLICY_ACTION_CATALOG.onboarding.viewWorkflows,
		policyResource: { kind: 'unscoped' },
		defer: true,
		fn: (ctx) => fetchOnboardingWorkspace(ctx, { mode: 'active' })
	});
	return { onboarding };
}

export interface OnboardingLayoutLoadDeps {
	streamOnboardingWorkspace?: (context: FeatureLaneWorkspaceRequestContext) => Promise<OnboardingWorkspaceRouteData>;
}

export function _createOnboardingLayoutLoad(deps: OnboardingLayoutLoadDeps = {}): LayoutServerLoad {
	const streamOnboardingWorkspace = deps.streamOnboardingWorkspace ?? streamOnboardingWorkspaceBootstrap;

	return async (event) =>
		streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:onboarding-data'],
			createContext: ({ locals, cookies }, shell) => {
				const decision = policyEvaluator.evaluate({
					decisionKind: 'server-authoritative',
					actor: { membershipRole: shell.member.role, userId: shell.user.id },
					action: POLICY_ACTION_CATALOG.onboarding.viewWorkflows,
					capabilityMap: shell.member.capabilityMap,
					scopeSet: shell.member.scopeSet,
					resource: { kind: 'unscoped' }
				});
				if (!decision.allowed) throw error(403, 'You do not have permission to view Onboarding');
				return { locals, cookies, orgId: shell.org.id };
			},
			streamWorkspace: streamOnboardingWorkspace
		});
}

export const load: LayoutServerLoad = _createOnboardingLayoutLoad();

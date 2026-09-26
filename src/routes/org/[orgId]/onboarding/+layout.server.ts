import type { LayoutServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG, policyEvaluator } from '$lib/access/policyEvaluator';
import {
	streamReadyFeatureLaneWorkspace,
	type FeatureLaneWorkspaceRequestContext
} from '$lib/server/core/featureLaneWorkspaceLoad';
import {
	streamOnboardingWorkspaceBootstrap,
	type OnboardingWorkspaceBootstrapOptions,
	type OnboardingWorkspaceRouteData
} from '$features/onboarding/server/onboardingWorkspaceBootstrap';

export interface OnboardingLayoutLoadDeps {
	streamOnboardingWorkspace?: (
		context: FeatureLaneWorkspaceRequestContext,
		options?: OnboardingWorkspaceBootstrapOptions
	) => Promise<OnboardingWorkspaceRouteData>;
}

function onboardingBootstrapOptionsForPath(pathname: string): OnboardingWorkspaceBootstrapOptions {
	const normalizedPath = pathname.replace(/\/+$/, '');
	return {
		mode: normalizedPath.endsWith('/onboarding/history') ? 'history' : 'active'
	};
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
			streamWorkspace: (context) =>
				streamOnboardingWorkspace(context, onboardingBootstrapOptionsForPath(event.url.pathname))
		});
}

export const load: LayoutServerLoad = _createOnboardingLayoutLoad();

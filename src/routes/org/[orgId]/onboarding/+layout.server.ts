import type { LayoutServerLoad } from './$types';
import {
	streamReadyFeatureLaneWorkspace,
	type FeatureLaneWorkspaceRequestContext
} from '$lib/server/core/featureLaneWorkspaceLoad';
import {
	streamOnboardingWorkspaceBootstrap,
	type OnboardingWorkspaceRouteData
} from '$features/onboarding/server/onboardingWorkspaceBootstrap';

export interface OnboardingLayoutLoadDeps {
	streamOnboardingWorkspace?: (context: FeatureLaneWorkspaceRequestContext) => Promise<OnboardingWorkspaceRouteData>;
}

export function _createOnboardingLayoutLoad(deps: OnboardingLayoutLoadDeps = {}): LayoutServerLoad {
	const streamOnboardingWorkspace = deps.streamOnboardingWorkspace ?? streamOnboardingWorkspaceBootstrap;

	return async (event) =>
		streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:onboarding-data'],
			streamWorkspace: streamOnboardingWorkspace
		});
}

export const load: LayoutServerLoad = _createOnboardingLayoutLoad();

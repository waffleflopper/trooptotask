import type { LayoutServerLoad } from './$types';
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
			streamWorkspace: (context) =>
				streamOnboardingWorkspace(context, onboardingBootstrapOptionsForPath(event.url.pathname))
		});
}

export const load: LayoutServerLoad = _createOnboardingLayoutLoad();

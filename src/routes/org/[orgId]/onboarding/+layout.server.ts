import type { LayoutServerLoad } from './$types';
import { createOrgLayoutLoad } from '$lib/server/core/useCases/createOrgLayoutLoad';
import type { OnboardingBootstrap } from '$lib/server/core/useCases/onboardingQuery';

export const load: LayoutServerLoad = createOrgLayoutLoad<OnboardingBootstrap>({
	workspace: 'onboarding',
	depends: ['app:org-core', 'app:onboarding-data']
});

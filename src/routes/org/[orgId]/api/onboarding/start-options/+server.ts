import { createRequestOnboardingStartOptionsContext } from '$lib/server/adapters/featureRequestContexts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fetchOnboardingStartOptions } from '$features/onboarding/index.server';
import type { OnboardingStartOptions } from '$features/onboarding/contracts';

export const _getConfig = {
	context: createRequestOnboardingStartOptionsContext,
	policyAction: POLICY_ACTION_CATALOG.onboarding.manageWorkflows,
	policyResource: { kind: 'unscoped' },
	parseInput: async () => ({}),
	fn: (ctx) => fetchOnboardingStartOptions(ctx)
} satisfies RouteConfig<
	Record<string, never>,
	OnboardingStartOptions,
	ReturnType<typeof createRequestOnboardingStartOptionsContext>
>;

export const GET = handle(_getConfig);

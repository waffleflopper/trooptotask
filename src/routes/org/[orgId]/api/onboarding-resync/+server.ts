import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { resyncOnboarding, switchTemplate } from '$lib/server/core/useCases/onboardingResync';

export const _postConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.onboarding.configureWorkflows,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		if (input.newTemplateId) {
			return switchTemplate(ctx, {
				onboardingId: input.onboardingId as string,
				newTemplateId: input.newTemplateId as string
			});
		}
		return resyncOnboarding(ctx, input.onboardingId as string);
	}
} satisfies RouteConfig<Record<string, unknown>, unknown>;

export const POST = handle(_postConfig);

import { createRequestOnboardingReconciliationContext } from '$lib/server/adapters/featureRequestContexts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/errors';
import { isUuid } from '$lib/utils/inputSchemas';
import { resyncOnboarding, switchTemplate } from '$features/onboarding/index.server';

export const _postConfig = {
	context: createRequestOnboardingReconciliationContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.onboarding.configureWorkflows,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		if (!isUuid(input.onboardingId)) fail(400, 'Invalid ID');
		if (input.newTemplateId !== undefined && !isUuid(input.newTemplateId)) fail(400, 'Invalid ID');
		if (input.newTemplateId) {
			return switchTemplate(ctx, {
				onboardingId: input.onboardingId as string,
				newTemplateId: input.newTemplateId as string
			});
		}
		return resyncOnboarding(ctx, input.onboardingId as string);
	}
} satisfies RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestOnboardingReconciliationContext>
>;

export const POST = handle(_postConfig);

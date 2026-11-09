import { createRequestOnboardingTemplateStepContext } from '$lib/server/adapters/featureRequestContexts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { setDefaultOnboardingTemplate } from '$features/onboarding/index.server';

export const _putConfig = {
	context: createRequestOnboardingTemplateStepContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.onboarding.configureWorkflows,
	policyResource: { kind: 'organization' },
	fn: (ctx, input) => setDefaultOnboardingTemplate(ctx, input)
} satisfies RouteConfig<
	Record<string, unknown>,
	{ templateId: string | null },
	ReturnType<typeof createRequestOnboardingTemplateStepContext>
>;

export const PUT = handle(_putConfig);

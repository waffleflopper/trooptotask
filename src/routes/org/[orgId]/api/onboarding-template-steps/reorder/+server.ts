import { createRequestOnboardingTemplateStepContext } from '$lib/server/adapters/featureRequestContexts.server';
import { z } from 'zod';
import { reorderOnboardingTemplateSteps } from '$features/onboarding/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle } from '$lib/server/adapters/httpAdapter';

const policyAction = POLICY_ACTION_CATALOG.onboarding.configureWorkflows;

export const POST = handle({
	context: createRequestOnboardingTemplateStepContext,
	mutation: true,
	policyAction,
	policyResource: { kind: 'organization' },
	input: z.object({
		templateId: z.string(),
		orderedStepIds: z.array(z.string())
	}),
	fn: reorderOnboardingTemplateSteps
});

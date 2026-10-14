import { createRequestOnboardingTemplateStepContext } from '$lib/server/adapters/featureRequestContexts.server';
import { z } from 'zod';
import { reorderOnboardingTemplateSteps } from '$features/onboarding/index.server';
import type { OnboardingTemplateStep } from '$features/onboarding/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { validateUUID } from '$lib/server/validation';

const policyAction = POLICY_ACTION_CATALOG.onboarding.configureWorkflows;
const reorderInput = z.object({
	templateId: z.string().refine(validateUUID, 'Invalid template ID'),
	orderedStepIds: z.array(z.string().refine(validateUUID, 'Invalid step ID'))
});

export const _postConfig = {
	context: createRequestOnboardingTemplateStepContext,
	mutation: true,
	policyAction,
	policyResource: { kind: 'organization' },
	input: reorderInput,
	fn: reorderOnboardingTemplateSteps
} satisfies RouteConfig<
	z.infer<typeof reorderInput>,
	OnboardingTemplateStep[],
	ReturnType<typeof createRequestOnboardingTemplateStepContext>
>;

export const POST = handle(_postConfig);

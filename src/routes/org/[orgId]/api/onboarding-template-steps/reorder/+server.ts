import { z } from 'zod';
import { reorderOnboardingTemplateSteps } from '$lib/server/core/useCases/onboardingTemplateCrud';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';
import { handle } from '$lib/server/adapters/httpAdapter';

const policyAction = OnboardingTemplateStepEntity.policyAction!;

export const POST = handle({
	mutation: true,
	policyAction,
	policyResource: { kind: 'unscoped' },
	input: z.object({
		templateId: z.string(),
		orderedStepIds: z.array(z.string())
	}),
	fn: reorderOnboardingTemplateSteps
});

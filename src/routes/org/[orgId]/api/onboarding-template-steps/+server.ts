import { fail } from '$lib/server/core/errors';
import {
	createOnboardingTemplateStep,
	deleteOnboardingTemplateStep,
	updateOnboardingTemplateStep
} from '$lib/server/core/useCases/onboardingTemplateCrud';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';
import { handle } from '$lib/server/adapters/httpAdapter';
import { validateUUID } from '$lib/server/validation';

const policyAction = OnboardingTemplateStepEntity.policyAction!;

export const POST = handle({
	mutation: true,
	policyAction,
	policyResource: { kind: 'unscoped' },
	input: OnboardingTemplateStepEntity.createSchema,
	fn: createOnboardingTemplateStep
});

export const PUT = handle({
	mutation: true,
	policyAction,
	policyResource: { kind: 'unscoped' },
	input: OnboardingTemplateStepEntity.updateSchema,
	fn: updateOnboardingTemplateStep
});

export const DELETE = handle({
	mutation: true,
	policyAction,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const id = input && typeof input === 'object' && 'id' in input ? input.id : undefined;
		if (typeof id !== 'string') {
			fail(400, 'Missing id');
		}
		if (!validateUUID(id)) {
			fail(400, 'Invalid resource ID');
		}
		await deleteOnboardingTemplateStep(ctx, id);
		return { success: true };
	}
});

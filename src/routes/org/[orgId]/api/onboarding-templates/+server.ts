import { fail } from '$lib/server/core/errors';
import {
	createOnboardingTemplate,
	deleteOnboardingTemplate,
	updateOnboardingTemplate
} from '$lib/server/core/useCases/onboardingTemplateCrud';
import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { handle } from '$lib/server/adapters/httpAdapter';
import { validateUUID } from '$lib/server/validation';

const policyAction = OnboardingTemplateEntity.policyAction!;

export const POST = handle({
	mutation: true,
	policyAction,
	policyResource: { kind: 'unscoped' },
	input: OnboardingTemplateEntity.createSchema,
	fn: createOnboardingTemplate
});

export const PUT = handle({
	mutation: true,
	policyAction,
	policyResource: { kind: 'unscoped' },
	input: OnboardingTemplateEntity.updateSchema,
	fn: updateOnboardingTemplate
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
		await deleteOnboardingTemplate(ctx, id);
		return { success: true };
	}
});

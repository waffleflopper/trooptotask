import { z } from 'zod';
import {
	createRequestOnboardingStepProgressContext,
	createRequestOnboardingInactiveStepContext
} from '$lib/server/adapters/featureRequestContexts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/errors';
import { isUuid, uuidSchema } from '$lib/utils/inputSchemas';
import { toggleCheckbox, advanceStage, addNote, removeInactiveStep } from '$features/onboarding/index.server';

const stepId = uuidSchema;
const putInput = z.discriminatedUnion(
	'action',
	[
		z.object({ action: z.literal('advanceStage'), stepId, stageName: z.string('Invalid stage name') }),
		z.object({
			action: z.literal('addNote'),
			stepId,
			text: z.string('Note text is required').refine((text) => text.trim(), 'Note text is required')
		}),
		z.object({
			action: z.literal('toggleCheckbox'),
			stepId,
			completed: z.boolean('Choose whether the step is complete')
		})
	],
	{ error: 'Unknown action' }
);

export const _putConfig = {
	context: createRequestOnboardingStepProgressContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.onboarding.manageWorkflows,
	policyResource: { kind: 'unscoped' },
	input: putInput,
	fn: async (ctx, input) => {
		if (input.action === 'advanceStage') return advanceStage(ctx, input);
		if (input.action === 'toggleCheckbox') return toggleCheckbox(ctx, input);
		if (!ctx.auth.userId) fail(401, 'Authentication required');
		return addNote(ctx, input);
	}
} satisfies RouteConfig<
	z.infer<typeof putInput>,
	unknown,
	ReturnType<typeof createRequestOnboardingStepProgressContext>
>;

export const _deleteConfig = {
	context: createRequestOnboardingInactiveStepContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.onboarding.manageWorkflows,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const stepId = input.id;
		if (!stepId) fail(400, 'Missing step id');
		if (!isUuid(stepId)) fail(400, 'Invalid ID');

		await removeInactiveStep(ctx, stepId);
		return { success: true };
	}
} satisfies RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestOnboardingInactiveStepContext>
>;

export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);

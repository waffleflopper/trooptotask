import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import {
	toggleCheckbox,
	advanceStage,
	addNote,
	removeInactiveStep
} from '$lib/server/core/useCases/onboardingStepProgress';

export const PUT = handle<Record<string, unknown>, unknown>({
	permission: 'onboarding',
	mutation: true,
	fn: async (ctx, input) => {
		const action = input.action as string;

		if (action === 'advanceStage') {
			return advanceStage(ctx, {
				stepId: input.stepId as string,
				stageName: input.stageName as string
			});
		}

		if (action === 'addNote') {
			const userId = ctx.auth.userId;
			if (!userId) fail(401, 'Authentication required');

			return addNote(ctx, {
				stepId: input.stepId as string,
				text: input.text as string,
				userId
			});
		}

		if (action === 'toggleCheckbox') {
			return toggleCheckbox(ctx, {
				stepId: input.stepId as string,
				completed: input.completed as boolean
			});
		}

		fail(400, `Unknown action: ${action}`);
	}
});

export const DELETE = handle<Record<string, unknown>, unknown>({
	permission: 'onboarding',
	mutation: true,
	fn: async (ctx, input) => {
		const stepId = input.id as string;
		if (!stepId) fail(400, 'Missing step id');

		await removeInactiveStep(ctx, stepId);
		return { success: true };
	}
});

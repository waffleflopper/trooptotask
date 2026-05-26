import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import {
	toggleCheckbox,
	advanceStage,
	addNote,
	removeInactiveStep
} from '$lib/server/core/useCases/onboardingStepProgress';

export const _putConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.onboarding.manageWorkflows,
	policyResource: { kind: 'unscoped' },
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
				text: input.text as string
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
} satisfies RouteConfig<Record<string, unknown>, unknown>;

export const _deleteConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.onboarding.manageWorkflows,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const stepId = input.id as string;
		if (!stepId) fail(400, 'Missing step id');

		await removeInactiveStep(ctx, stepId);
		return { success: true };
	}
} satisfies RouteConfig<Record<string, unknown>, unknown>;

export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);

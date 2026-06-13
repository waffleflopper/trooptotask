import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import {
	startOnboarding,
	cancelOnboarding,
	reopenOnboarding,
	completeOnboarding
} from '$lib/server/core/useCases/onboardingLifecycle';

export const _postConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.onboarding.manageWorkflows,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) =>
		startOnboarding(ctx, {
			personnelId: input.personnelId as string,
			templateId: input.templateId as string,
			startedAt: input.startedAt as string | undefined
		})
} satisfies RouteConfig<Record<string, unknown>, unknown>;

export const _putConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.onboarding.manageWorkflows,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const id = input.id as string;
		const status = input.status as string;

		if (status === 'cancelled') return cancelOnboarding(ctx, id);
		if (status === 'completed') return completeOnboarding(ctx, id);
		if (status === 'in_progress') return reopenOnboarding(ctx, id);

		fail(400, `Invalid status: ${status}`);
	}
} satisfies RouteConfig<Record<string, unknown>, unknown>;

export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);

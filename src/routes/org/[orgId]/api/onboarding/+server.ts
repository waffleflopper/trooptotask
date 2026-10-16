import {
	createRequestOnboardingStartContext,
	createRequestOnboardingLifecycleContext
} from '$lib/server/adapters/featureRequestContexts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/errors';
import { dateOnlySchema, isUuid, issueMessage } from '$lib/utils/inputSchemas';
import {
	startOnboarding,
	cancelOnboarding,
	reopenOnboarding,
	completeOnboarding
} from '$features/onboarding/index.server';

export const _postConfig = {
	context: createRequestOnboardingStartContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.onboarding.manageWorkflows,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => {
		if (!isUuid(input.personnelId)) fail(400, 'Choose a Person to onboard');
		return startOnboarding(ctx, {
			personnelId: input.personnelId as string,
			templateId: input.templateId as string,
			startedAt: input.startedAt as string | undefined
		});
	}
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestOnboardingStartContext>>;

export const _putConfig = {
	context: createRequestOnboardingLifecycleContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.onboarding.manageWorkflows,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const id = input.id;
		if (!isUuid(id)) fail(400, 'Invalid ID');
		const status = input.status as string;

		if (status === 'cancelled') return cancelOnboarding(ctx, id);
		if (status === 'completed') {
			const completedOn = dateOnlySchema.safeParse(input.completedAt);
			if (!completedOn.success) fail(400, issueMessage(completedOn.error));
			return completeOnboarding(ctx, id, completedOn.data);
		}
		if (status === 'in_progress') return reopenOnboarding(ctx, id);

		fail(400, `Invalid status: ${status}`);
	}
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestOnboardingLifecycleContext>>;

export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);

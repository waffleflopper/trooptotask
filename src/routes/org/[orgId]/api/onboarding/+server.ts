import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import {
	startOnboarding,
	cancelOnboarding,
	reopenOnboarding,
	completeOnboarding
} from '$lib/server/core/useCases/onboardingLifecycle';

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'onboarding',
	mutation: true,
	fn: (ctx, input) =>
		startOnboarding(ctx, {
			personnelId: input.personnelId as string,
			templateId: input.templateId as string
		})
});

export const PUT = handle<Record<string, unknown>, unknown>({
	permission: 'onboarding',
	mutation: true,
	fn: async (ctx, input) => {
		const id = input.id as string;
		const status = input.status as string;

		if (status === 'cancelled') return cancelOnboarding(ctx, id);
		if (status === 'completed') return completeOnboarding(ctx, id);
		if (status === 'in_progress') return reopenOnboarding(ctx, id);

		fail(400, `Invalid status: ${status}`);
	}
});

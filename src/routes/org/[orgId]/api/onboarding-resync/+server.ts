import { handle } from '$lib/server/adapters/httpAdapter';
import { resyncOnboarding, switchTemplate } from '$lib/server/core/useCases/onboardingResync';

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'onboarding',
	mutation: true,
	fn: async (ctx, input) => {
		if (input.newTemplateId) {
			return switchTemplate(ctx, {
				onboardingId: input.onboardingId as string,
				newTemplateId: input.newTemplateId as string
			});
		}
		return resyncOnboarding(ctx, input.onboardingId as string);
	}
});

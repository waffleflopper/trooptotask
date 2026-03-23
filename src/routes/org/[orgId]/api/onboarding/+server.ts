import { postHandler, putHandler } from '$lib/server/adapters/httpAdapter';
import {
	startOnboarding,
	cancelOnboarding,
	reopenOnboarding,
	completeOnboarding
} from '$lib/server/core/useCases/onboardingLifecycle';
import { fail } from '$lib/server/core/errors';

export const POST = postHandler(async (ctx, body) => {
	return startOnboarding(ctx, {
		personnelId: body.personnelId as string,
		templateId: body.templateId as string
	});
});

export const PUT = putHandler(async (ctx, body) => {
	const id = body.id as string;
	const status = body.status as string;

	if (status === 'cancelled') return cancelOnboarding(ctx, id);
	if (status === 'completed') return completeOnboarding(ctx, id);
	if (status === 'in_progress') return reopenOnboarding(ctx, id);

	fail(400, `Invalid status: ${status}`);
});

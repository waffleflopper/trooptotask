import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { toggleCheckbox } from '$lib/server/core/useCases/onboardingStepProgress';

export const PUT = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const body = (await event.request.json()) as Record<string, unknown>;

	const result = await toggleCheckbox(ctx, {
		stepId: body.stepId as string,
		completed: body.completed as boolean
	});

	return json(result);
};

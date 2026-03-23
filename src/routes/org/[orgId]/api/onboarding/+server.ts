import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { startOnboarding } from '$lib/server/core/useCases/onboardingLifecycle';

export const POST = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const body = (await event.request.json()) as Record<string, unknown>;

	const result = await startOnboarding(ctx, {
		personnelId: body.personnelId as string,
		templateId: body.templateId as string
	});

	return json(result);
};

import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { resyncOnboarding, switchTemplate } from '$lib/server/core/useCases/onboardingResync';

export const POST = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const { onboardingId, newTemplateId } = (await event.request.json()) as Record<string, unknown>;

	if (newTemplateId) {
		const result = await switchTemplate(ctx, {
			onboardingId: onboardingId as string,
			newTemplateId: newTemplateId as string
		});
		return json(result);
	}

	const result = await resyncOnboarding(ctx, onboardingId as string);
	return json(result);
};

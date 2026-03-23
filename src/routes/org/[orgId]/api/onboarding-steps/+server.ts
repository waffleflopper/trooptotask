import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import {
	toggleCheckbox,
	advanceStage,
	addNote,
	removeInactiveStep
} from '$lib/server/core/useCases/onboardingStepProgress';

export const PUT = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const body = (await event.request.json()) as Record<string, unknown>;
	const action = body.action as string;

	if (action === 'advanceStage') {
		const result = await advanceStage(ctx, {
			stepId: body.stepId as string,
			stageName: body.stageName as string
		});
		return json(result);
	}

	if (action === 'addNote') {
		const userId = ctx.auth.userId;
		if (!userId) fail(401, 'Authentication required');

		const result = await addNote(ctx, {
			stepId: body.stepId as string,
			text: body.text as string,
			userId
		});
		return json(result);
	}

	if (action === 'toggleCheckbox') {
		const result = await toggleCheckbox(ctx, {
			stepId: body.stepId as string,
			completed: body.completed as boolean
		});
		return json(result);
	}

	fail(400, `Unknown action: ${action}`);
};

export const DELETE = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const body = (await event.request.json()) as Record<string, unknown>;
	const stepId = body.id as string;

	if (!stepId) fail(400, 'Missing step id');

	await removeInactiveStep(ctx, stepId);
	return json({ success: true });
};

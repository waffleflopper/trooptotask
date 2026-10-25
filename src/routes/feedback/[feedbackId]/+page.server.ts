import { error, isHttpError, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { PageServerLoad } from './$types';
import { createRequestReporterFeedback } from '$lib/server/adapters/feedbackDelivery.server';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const actor = locals.actor;
	if (!actor) redirect(303, `/auth/login?next=${encodeURIComponent(url.pathname)}`);
	const id = z.uuid().safeParse(params.feedbackId);
	if (!id.success) error(404, 'Not found');
	try {
		const feedback = await createRequestReporterFeedback(locals, actor.userId).detail(id.data);
		if (!feedback) error(404, 'Not found');
		return { feedback };
	} catch (cause) {
		if (isHttpError(cause)) throw cause;
		console.error('[feedback] reporter detail failed', cause);
		error(503, 'Unable to load your feedback. Try again.');
	}
};

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createRequestReporterFeedback } from '$lib/server/adapters/feedbackDelivery.server';

export const load: PageServerLoad = async ({ locals, url }) => {
	const actor = locals.actor;
	if (!actor) redirect(303, `/auth/login?next=${encodeURIComponent(url.pathname)}`);
	try {
		return { feedback: await createRequestReporterFeedback(locals, actor.userId).list() };
	} catch (cause) {
		console.error('[feedback] reporter list failed', cause);
		return { feedback: null };
	}
};

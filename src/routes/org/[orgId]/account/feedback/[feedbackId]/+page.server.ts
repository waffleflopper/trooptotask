import { error, fail, isHttpError, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
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
		return { feedback: null };
	}
};

const replyBody = z.string().trim().min(1).max(5000);

export const actions = {
	reply: async ({ locals, params, request }) => {
		if (!locals.actor) redirect(303, '/auth/login');
		const id = z.uuid().safeParse(params.feedbackId);
		if (!id.success) return fail(404, { message: 'Feedback not found.' });
		const form = await request.formData().catch(() => null);
		const body = replyBody.safeParse(form?.get('body'));
		if (!body.success) return fail(400, { message: 'Enter a reply between 1 and 5000 characters.' });
		try {
			const result = await createRequestReporterFeedback(locals, locals.actor.userId).reply({
				feedbackId: id.data,
				body: body.data
			});
			switch (result.status) {
				case 'replied':
					return { reply: result.reply };
				case 'closed':
					return fail(409, { message: 'This feedback is closed.' });
				case 'notFound':
					return fail(404, { message: 'Feedback not found.' });
				case 'failed':
					return fail(503, { message: 'Unable to send your reply. Try again.' });
			}
		} catch {
			return fail(503, { message: 'Unable to send your reply. Try again.' });
		}
	}
} satisfies Actions;

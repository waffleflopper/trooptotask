import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRequestFeedbackSubmission, readJsonBody, rethrowOrWrap } from '$lib/server/adapters/httpAdapter';

export const POST: RequestHandler = async ({ request, locals }) => {
	const actor = locals.actor;
	if (!actor) throw error(401, 'Authentication required');

	const body = await readJsonBody({ request }).catch(rethrowOrWrap);
	const result = await createRequestFeedbackSubmission().submit({
		userId: actor.userId,
		userEmail: locals.user?.email,
		category: body.category,
		message: body.message,
		pageUrl: body.pageUrl,
		organizationId: body.organizationId
	});

	if (result.status === 'submitted') {
		return json({ success: true, githubIssue: result.githubIssue });
	}

	if (result.status === 'validation_error') {
		throw error(400, result.message);
	}

	if (result.status === 'organization_access_denied') {
		throw error(403, result.message);
	}

	throw error(500, result.message);
};

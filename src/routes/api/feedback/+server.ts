import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabasePlatformFeedbackForSubmission } from '$lib/server/adapters/supabasePlatformFeedback';

function asFeedbackBody(body: unknown): Record<string, unknown> {
	return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Authentication required');

	const body = asFeedbackBody(await request.json());
	const result = await createSupabasePlatformFeedbackForSubmission().submit({
		userId: user.id,
		userEmail: user.email,
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

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Authentication required');

	const body = await request.json();
	const { category, message, pageUrl, organizationId, organizationName } = body;

	if (!message?.trim()) {
		throw error(400, 'Message is required');
	}

	if (category && !['bug', 'feature', 'general'].includes(category)) {
		throw error(400, 'Invalid category');
	}

	const adminClient = getAdminClient();

	const { error: insertError } = await adminClient.from('beta_feedback').insert({
		user_id: user.id,
		user_email: user.email,
		organization_id: organizationId || null,
		organization_name: organizationName || null,
		category: category || 'general',
		message: message.trim(),
		page_url: pageUrl || null
	});

	if (insertError) {
		console.error('Failed to insert feedback:', insertError);
		throw error(500, 'Failed to submit feedback');
	}

	return json({ success: true });
};

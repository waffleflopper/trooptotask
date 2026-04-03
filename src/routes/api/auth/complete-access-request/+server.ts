import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { markApprovedAccessRequestCompleted } from '$lib/server/accessRequestAuth';

export const POST: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user?.email) {
		return json({ updated: 0 }, { status: 401 });
	}

	const adminClient = getAdminClient();
	const result = await markApprovedAccessRequestCompleted(adminClient, user.email, user.id);
	return json(result);
};

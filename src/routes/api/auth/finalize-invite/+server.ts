import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { autoAcceptOrgInvites } from '$lib/server/auto-accept-org-invites';
import { getAdminClient } from '$lib/server/supabase';
import { markApprovedAccessRequestCompleted } from '$lib/server/accessRequestAuth';

export const POST: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user?.email) {
		return json({ accepted: 0, completed: 0 }, { status: 401 });
	}

	const accepted = await autoAcceptOrgInvites(locals.supabase, user.id, user.email);

	let completed = 0;
	try {
		const result = await markApprovedAccessRequestCompleted(getAdminClient(), user.email, user.id);
		completed = result.updated;
	} catch (completionError) {
		console.error('Failed to mark approved access request complete during invite finalization:', completionError);
	}

	return json({ accepted: accepted.accepted, completed });
};

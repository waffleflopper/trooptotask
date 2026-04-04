import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { autoAcceptOrgInvites } from '$lib/server/auto-accept-org-invites';
import { getAdminClient } from '$lib/server/supabase';
import { markApprovedAccessRequestCompleted } from '$lib/server/accessRequestAuth';

export const POST: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user?.email) {
		return json(
			{
				error: 'Your invite session is no longer active. Please reopen the invite link and try again.',
				accepted: 0,
				completed: 0
			},
			{ status: 401 }
		);
	}

	try {
		const accepted = await autoAcceptOrgInvites(locals.supabase, user.id, user.email);
		const completion = await markApprovedAccessRequestCompleted(getAdminClient(), user.email, user.id);

		return json({ ok: true, accepted: accepted.accepted, completed: completion.updated });
	} catch (error) {
		console.error('Failed to finalize invite activation:', error);
		return json(
			{
				error:
					'Your password was set, but we could not finish connecting your account. Please try the invite link again or contact support.'
			},
			{ status: 500 }
		);
	}
};

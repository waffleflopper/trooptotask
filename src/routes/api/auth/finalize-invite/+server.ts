import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { autoAcceptOrgInvites } from '$lib/server/auto-accept-org-invites';
import { getAdminClient } from '$lib/server/supabase';
import { markApprovedAccessRequestCompleted } from '$lib/server/accessRequestAuth';
import { getPendingAuthFlowCookieName } from '$lib/server/mfaGate';
import { parseUserProfileForm, upsertCurrentUserProfile } from '$lib/server/userProfile';

function parseMetadataProfile(metadata: Record<string, unknown> | null | undefined) {
	return parseUserProfileForm({
		firstName: String(metadata?.firstName ?? metadata?.first_name ?? ''),
		lastName: String(metadata?.lastName ?? metadata?.last_name ?? ''),
		rank: String(metadata?.rank ?? '')
	});
}

export const POST: RequestHandler = async ({ locals, cookies }) => {
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
		const profile = parseMetadataProfile((user as { user_metadata?: Record<string, unknown> }).user_metadata);
		if (!('error' in profile)) {
			await upsertCurrentUserProfile(locals, profile);
		}

		const accepted = await autoAcceptOrgInvites(locals.supabase, user.id, user.email);
		const completion = await markApprovedAccessRequestCompleted(getAdminClient(), user.email, user.id);
		cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });

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

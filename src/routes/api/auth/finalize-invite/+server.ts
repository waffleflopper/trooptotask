import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { autoAcceptOrgInvites } from '$lib/server/auto-accept-org-invites';
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
				activated: false
			},
			{ status: 401 }
		);
	}

	try {
		const profile = parseMetadataProfile((user as { user_metadata?: Record<string, unknown> }).user_metadata);
		if (!('error' in profile)) {
			await upsertCurrentUserProfile(locals, profile);
		}

		const accepted = await autoAcceptOrgInvites(locals.supabase, user.email);
		cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });

		return json({ ok: true, accepted: accepted.accepted, activated: true });
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

import { checkSessionAssurance } from '$lib/server/sessionAssurance';
import { passwordCompletionState } from '$lib/server/passwordCompletion';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { autoAcceptOrgInvites, InvitationAcceptanceError } from '$lib/server/auto-accept-org-invites';
import { getPendingAuthFlowCookieName } from '$features/identity/index.server';
import { parseUserProfileForm, upsertCurrentUserProfile } from '$lib/server/userProfile';

function parseMetadataProfile(metadata: Record<string, unknown> | null | undefined) {
	return parseUserProfileForm({
		firstName: String(metadata?.firstName ?? metadata?.first_name ?? ''),
		lastName: String(metadata?.lastName ?? metadata?.last_name ?? ''),
		rank: String(metadata?.rank ?? '')
	});
}

export const POST: RequestHandler = async ({ locals, cookies }) => {
	const { user, session } = locals;
	const inactiveSession = () =>
		json(
			{
				error: 'Your invite session is no longer active. Please reopen the invite link and try again.',
				accepted: 0,
				activated: false
			},
			{ status: 401 }
		);
	if (
		typeof user?.id !== 'string' ||
		!user.id ||
		typeof user.email !== 'string' ||
		!user.email.trim() ||
		session?.user?.id !== user.id ||
		typeof session.access_token !== 'string' ||
		!/^\S+$/.test(session.access_token) ||
		typeof session.expires_at !== 'number' ||
		!Number.isFinite(session.expires_at) ||
		session.expires_at <= Date.now() / 1000
	) {
		return inactiveSession();
	}
	if (locals.authFlow !== 'invite') {
		return json(
			{
				code: 'invite_not_pending',
				error: 'No invitation is awaiting activation in this session.',
				accepted: 0,
				activated: false
			},
			{ status: 403 }
		);
	}

	// Completion grants membership and clears the pending flow. Recheck the admitted
	// token immediately before these effects, including when hook admission was stale.
	const assurance = await checkSessionAssurance(locals.supabase, session);
	if (assurance === 'unavailable')
		return json(
			{ error: 'Unable to verify authentication status. Please try again.', accepted: 0, activated: false },
			{ status: 503 }
		);
	if (assurance === 'expired') return inactiveSession();
	if (assurance === 'mfa_required')
		return json(
			{
				code: 'mfa_required',
				error: 'Verify your authenticator code before finishing account activation.',
				accepted: 0,
				activated: false
			},
			{ status: 403 }
		);

	const completion = await passwordCompletionState(locals);
	if (completion !== 'complete')
		return json(
			{ error: 'Finish the password update before activating your account.', accepted: 0, activated: false },
			{ status: 409 }
		);

	if (session.expires_at <= Date.now() / 1000) return inactiveSession();
	try {
		const profile = parseMetadataProfile((user as { user_metadata?: Record<string, unknown> }).user_metadata);
		if (!('error' in profile)) {
			await upsertCurrentUserProfile(locals, profile);
		}

		if (session.expires_at <= Date.now() / 1000) return inactiveSession();
		const accepted = await autoAcceptOrgInvites(locals.supabase, user.email);
		if (session.expires_at <= Date.now() / 1000) return inactiveSession();
		cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });

		return json({ ok: true, ...accepted, activated: true });
	} catch (error) {
		const setupRequired = error instanceof InvitationAcceptanceError && error.reason === 'setup_required';
		return json(
			{
				error: setupRequired
					? 'Complete your Account Setup Link before accepting this Organization invitation.'
					: 'Unable to confirm account activation. Some invitations may already be accepted. Please try again.',
				code: setupRequired ? 'setup_required' : 'activation_unavailable',
				accepted: error instanceof InvitationAcceptanceError ? error.accepted : 0,
				activated: false
			},
			{ status: setupRequired ? 409 : 503 }
		);
	}
};

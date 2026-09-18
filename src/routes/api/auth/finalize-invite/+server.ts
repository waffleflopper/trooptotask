import { passwordCompletionState } from '$lib/server/passwordCompletion';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { autoAcceptOrgInvites } from '$lib/server/auto-accept-org-invites';
import { getPendingAuthFlowCookieName, isMfaStepUpRequired } from '$lib/server/mfaGate';
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
			{ error: 'No invitation is awaiting activation in this session.', accepted: 0, activated: false },
			{ status: 403 }
		);
	}

	// Completion grants membership and clears the pending flow. Recheck the admitted
	// token immediately before these effects, including when hook admission was stale.
	try {
		const assurance = await locals.supabase.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token);
		if (
			assurance?.error !== null ||
			!['aal1', 'aal2'].includes(assurance.data?.currentLevel ?? '') ||
			!['aal1', 'aal2'].includes(assurance.data?.nextLevel ?? '')
		) {
			return json(
				{ error: 'Unable to verify authentication status. Please try again.', accepted: 0, activated: false },
				{ status: 503 }
			);
		}
		if (session.expires_at <= Date.now() / 1000) return inactiveSession();
		if (isMfaStepUpRequired(assurance.data)) {
			return json(
				{
					code: 'mfa_required',
					error: 'Verify your authenticator code before finishing account activation.',
					accepted: 0,
					activated: false
				},
				{ status: 403 }
			);
		}
	} catch {
		return json(
			{ error: 'Unable to verify authentication status. Please try again.', accepted: 0, activated: false },
			{ status: 503 }
		);
	}

	const completion = await passwordCompletionState(locals);
	if (completion !== 'complete')
		return json(
			{ error: 'Finish the password update before activating your account.', accepted: 0, activated: false },
			{ status: 409 }
		);

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
				error: 'Unable to finish account activation. Please try again.'
			},
			{ status: 500 }
		);
	}
};

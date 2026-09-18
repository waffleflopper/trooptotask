import { verifyPasswordProof } from '$lib/server/passwordProof';
import { checkDurableRateLimit } from '$lib/server/durableRateLimit';
import { checkSessionAssurance } from '$lib/server/sessionAssurance';
import { passwordCompletionState } from '$lib/server/passwordCompletion';
import type { PageServerLoad } from './$types';
import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { validateEmail } from '$lib/server/validation';

function getPendingEmail(user: App.Locals['user']): string | null {
	const rawUser = user as Record<string, unknown> | null;
	const value = rawUser?.new_email ?? rawUser?.email_change ?? rawUser?.email_change_sent_to;
	return typeof value === 'string' && value ? value : null;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/auth/login');

	const { data: factors } = await locals.supabase.auth.mfa.listFactors();
	const totpFactors = factors?.totp ?? [];
	const hasMFA = totpFactors.some((f: Record<string, unknown>) => f.status === 'verified');

	return {
		passwordCompletion: await passwordCompletionState(locals),
		hasMFA,
		currentEmail: locals.user.email ?? '',
		pendingEmail: getPendingEmail(locals.user)
	};
};

export const actions: Actions = {
	updateEmail: async ({ request, locals, getClientAddress }) => {
		const { user, session } = locals;
		if (!user) redirect(303, '/auth/login');
		const inactive = () => emailFailure(401, { emailError: 'Your session is no longer active. Sign in again.' });
		if (
			typeof user.id !== 'string' ||
			!user.id ||
			typeof user.email !== 'string' ||
			!user.email ||
			session?.user?.id !== user.id ||
			typeof session.access_token !== 'string' ||
			!/^\S+$/.test(session.access_token) ||
			typeof session.expires_at !== 'number' ||
			!Number.isFinite(session.expires_at) ||
			session.expires_at <= Date.now() / 1000
		)
			return inactive();
		const formData = await request.formData().catch(() => null);
		const rawEmail = formData?.get('email');
		const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
		if (!formData || formData.getAll('email').length !== 1 || !validateEmail(email))
			return emailFailure(400, { emailError: 'Enter a valid email address', email });
		if (email === user.email.toLowerCase())
			return emailFailure(400, { emailError: 'Enter a different email address', email });
		const currentPassword = formData.get('currentPassword');
		if (typeof currentPassword !== 'string' || !currentPassword || formData.getAll('currentPassword').length !== 1)
			return emailFailure(400, { emailError: 'Enter your current password to change your email', email });
		if (session.expires_at <= Date.now() / 1000) return inactive();
		try {
			const limit = await checkDurableRateLimit({
				namespace: 'email-change',
				dimensions: [
					{ name: 'user', value: user.id },
					{ name: 'ip', value: getClientAddress() }
				],
				windowMs: 15 * 60 * 1000,
				maxRequests: 5
			});
			if (limit.limited)
				return emailFailure(429, {
					emailError: 'Too many email change attempts. Please wait before trying again.',
					email,
					retryAfterSeconds: Math.max(1, Math.ceil(limit.retryAfterMs / 1000))
				});
		} catch {
			return emailFailure(503, { emailError: 'Unable to verify the request limit. Please try again.', email });
		}
		if (session.expires_at <= Date.now() / 1000) return inactive();
		const proof = await verifyPasswordProof(user.id, user.email, currentPassword).catch(() => 'unavailable' as const);
		if (proof === 'incorrect') return emailFailure(401, { emailError: 'Current password is incorrect', email });
		if (proof !== 'accepted')
			return emailFailure(503, { emailError: 'Unable to verify your current password. Please try again.', email });
		if (session.expires_at <= Date.now() / 1000) return inactive();
		const assurance = await checkSessionAssurance(locals.supabase, session);
		if (assurance === 'unavailable')
			return emailFailure(503, { emailError: 'Unable to verify authentication status. Please try again.', email });
		if (assurance === 'expired') return inactive();
		if (assurance === 'mfa_required')
			return emailFailure(403, {
				code: 'mfa_required',
				emailError: 'Verify your authenticator code before changing your email.',
				email
			});
		// A lost response does not prove rollback. Reload recovers the provider's pending address.
		const unavailable = () =>
			emailFailure(503, {
				emailError: 'Unable to confirm the email request. Check your inboxes or reload before retrying.',
				email
			});
		try {
			const result = await locals.supabase.auth.updateUser({ email });
			if (
				result?.error !== null ||
				result.data?.user?.id !== user.id ||
				getPendingEmail(result.data.user) !== email ||
				result.data.user.email?.toLowerCase() !== user.email.toLowerCase()
			)
				return unavailable();
		} catch {
			return unavailable();
		}
		return {
			emailSuccess:
				'Check both your current and new inboxes for confirmation instructions. Keep signing in with your current email until the change is confirmed.',
			pendingEmail: email
		};
	}
};

function emailFailure(
	status: number,
	data: { emailError: string; email?: string; code?: 'mfa_required'; retryAfterSeconds?: number }
) {
	return fail(status, data);
}

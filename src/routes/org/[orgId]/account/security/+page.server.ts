import { readIdentitySecurity, updateIdentityEmail } from '$features/identity/index.server';
import { passwordCompletionState } from '$features/identity/index.server';
import {
	EMAIL_CHANGE_PASSWORD_REQUIRED_MESSAGE,
	INCORRECT_CURRENT_PASSWORD_MESSAGE,
	INVALID_EMAIL_MESSAGE,
	SAME_EMAIL_MESSAGE
} from '$features/identity/contracts';
import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	const [overview, passwordCompletion] = await Promise.all([
		readIdentitySecurity(locals),
		passwordCompletionState(locals)
	]);
	if (!overview) redirect(303, '/auth/login');
	return { passwordCompletion, ...overview };
};

export const actions: Actions = {
	updateEmail: async ({ request, locals, getClientAddress }) => {
		if (!locals.user) redirect(303, '/auth/login');
		const formData = await request.formData().catch(() => null);
		const rawEmail = formData?.get('email');
		const rawPassword = formData?.get('currentPassword');
		const result = await updateIdentityEmail(locals, {
			email: typeof rawEmail === 'string' ? rawEmail : null,
			emailCount: formData?.getAll('email').length ?? 0,
			currentPassword: typeof rawPassword === 'string' ? rawPassword : null,
			passwordCount: formData?.getAll('currentPassword').length ?? 0,
			clientAddress: getClientAddress()
		});
		switch (result.status) {
			case 'accepted':
				return {
					emailSuccess:
						'Check both your current and new inboxes for confirmation instructions. Keep signing in with your current email until the change is confirmed.',
					pendingEmail: result.email
				};
			case 'inactive':
				return emailFailure(401, { emailError: 'Your session is no longer active. Sign in again.' });
			case 'invalid-email':
				return emailFailure(400, { emailError: INVALID_EMAIL_MESSAGE, email: result.email });
			case 'same-email':
				return emailFailure(400, { emailError: SAME_EMAIL_MESSAGE, email: result.email });
			case 'missing-password':
				return emailFailure(400, {
					emailError: EMAIL_CHANGE_PASSWORD_REQUIRED_MESSAGE,
					email: result.email
				});
			case 'limited':
				return emailFailure(429, {
					emailError: 'Too many email change attempts. Please wait before trying again.',
					email: result.email,
					retryAfterSeconds: result.retryAfterSeconds
				});
			case 'limit-unavailable':
				return emailFailure(503, {
					emailError: 'Unable to verify the request limit. Please try again.',
					email: result.email
				});
			case 'incorrect-password':
				return emailFailure(401, { emailError: INCORRECT_CURRENT_PASSWORD_MESSAGE, email: result.email });
			case 'proof-unavailable':
				return emailFailure(503, {
					emailError: 'Unable to verify your current password. Please try again.',
					email: result.email
				});
			case 'assurance-unavailable':
				return emailFailure(503, {
					emailError: 'Unable to verify authentication status. Please try again.',
					email: result.email
				});
			case 'mfa-required':
				return emailFailure(403, {
					code: 'mfa_required',
					emailError: 'Verify your authenticator code before changing your email.',
					email: result.email
				});
			case 'unconfirmed':
				return emailFailure(503, {
					emailError: 'Unable to confirm the email request. Check your inboxes or reload before retrying.',
					email: result.email
				});
		}
	}
};

function emailFailure(
	status: number,
	data: { emailError: string; email?: string; code?: 'mfa_required'; retryAfterSeconds?: number }
) {
	return fail(status, data);
}

import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { validateEmail } from '$lib/server/validation';
import { auditLog } from '$lib/server/auditLog';
import { getAuthenticatedRedirectPath, loginIdentity } from '$features/identity/index.server';
import { sanitizeAuthNextPath } from '$features/identity/contracts';

export const load: PageServerLoad = async ({ locals, url }) => {
	const reauth = url.searchParams.get('reauth') === '1';
	const nextPath = sanitizeAuthNextPath(url.searchParams.get('next'));

	if (url.searchParams.get('error') === 'auth_link_invalid') {
		return {
			reauth,
			nextPath,
			authLinkError:
				'This email link is invalid or has expired. Request a fresh account setup link or password reset email and try again.'
		};
	}

	if (locals.session && !reauth) {
		redirect(303, getAuthenticatedRedirectPath(locals.authFlow, locals.mfaPending));
	}

	return { reauth, nextPath };
};

export const actions: Actions = {
	login: async ({ request, locals }) => {
		let formData: FormData;
		try {
			formData = await request.formData();
		} catch {
			return fail(400, { error: 'Enter a valid email address and password.', email: '', nextPath: null });
		}
		const emailValue = formData.get('email');
		const password = formData.get('password');
		const email = typeof emailValue === 'string' ? emailValue.trim().toLowerCase() : '';
		const nextPath = sanitizeAuthNextPath(formData.get('next'));
		if (
			formData.getAll('email').length !== 1 ||
			formData.getAll('password').length !== 1 ||
			!validateEmail(email) ||
			typeof password !== 'string' ||
			!password
		) {
			return fail(400, { error: 'Enter a valid email address and password.', email: email.slice(0, 254), nextPath });
		}
		const result = await loginIdentity(locals, { email, password });
		if (result.status !== 'authenticated') {
			auditLog(
				{ action: 'auth.login_failure', resourceType: 'user', severity: 'warning', details: { email } },
				{ userId: null }
			);
			return result.status === 'invalid'
				? fail(400, { error: 'Email or password is incorrect', email, nextPath })
				: fail(503, { error: 'Unable to complete sign in. Please try again.', email, nextPath });
		}

		auditLog({ action: 'auth.login_success', resourceType: 'user', details: { email } }, { userId: null });
		if (result.mfaPending) {
			const suffix = nextPath ? `?next=${encodeURIComponent(nextPath)}` : '';
			redirect(303, `/auth/mfa-verify${suffix}`);
		}
		redirect(303, nextPath ?? '/dashboard');
	}
};

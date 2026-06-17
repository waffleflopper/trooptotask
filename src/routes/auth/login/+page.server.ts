import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sanitizeString } from '$lib/server/validation';
import { auditLog } from '$lib/server/auditLog';
import { getAuthenticatedRedirectPath } from '$lib/server/mfaGate';
import { sanitizeAuthNextPath } from '$lib/auth/redirects';

export const load: PageServerLoad = async ({ locals, url }) => {
	const reauth = url.searchParams.get('reauth') === '1';
	const nextPath = sanitizeAuthNextPath(url.searchParams.get('next'));

	if (url.searchParams.get('error') === 'auth_link_invalid') {
		return {
			reauth,
			nextPath,
			authLinkError:
				'This email link is invalid or has expired. Request a fresh signup, invite, or password reset email and try again.'
		};
	}

	if (locals.session && !reauth) {
		redirect(303, getAuthenticatedRedirectPath(locals.authFlow, locals.mfaPending));
	}

	return { reauth, nextPath };
};

export const actions: Actions = {
	login: async ({ request, locals }) => {
		try {
			const formData = await request.formData();
			const email = sanitizeString(formData.get('email') as string, 254).toLowerCase();
			const password = formData.get('password') as string;
			const nextPath = sanitizeAuthNextPath(formData.get('next'));

			if (!email || !password) {
				return fail(400, { error: 'Email and password are required', email, nextPath });
			}

			const { error } = await locals.supabase.auth.signInWithPassword({ email, password });

			if (error) {
				auditLog(
					{ action: 'auth.login_failure', resourceType: 'user', severity: 'warning', details: { email } },
					{ userId: null }
				);
				return fail(400, { error: 'Email or password is incorrect', email, nextPath });
			}

			auditLog({ action: 'auth.login_success', resourceType: 'user', details: { email } }, { userId: null });

			// Check if user has MFA enabled and needs to complete verification
			const { data: aalData } = await locals.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
			if (aalData?.nextLevel === 'aal2' && aalData?.currentLevel === 'aal1') {
				const suffix = nextPath ? `?next=${encodeURIComponent(nextPath)}` : '';
				redirect(303, `/auth/mfa-verify${suffix}`);
			}

			redirect(303, nextPath ?? '/dashboard');
		} catch (err) {
			if (isRedirect(err)) {
				throw err;
			}
			console.error('Login error:', err);
			return fail(500, { error: 'An unexpected error occurred. Please try again.', email: '' });
		}
	}
};

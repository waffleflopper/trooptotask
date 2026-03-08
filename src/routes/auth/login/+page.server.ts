import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sanitizeString } from '$lib/server/validation';
import { auditLog } from '$lib/server/auditLog';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Check for demo unavailable error from redirect
	const demoError = url.searchParams.get('error');
	if (demoError === 'demo_unavailable') {
		return { demoError: 'Demo is not available. Please try again later.' };
	}

	if (locals.session) {
		redirect(303, '/dashboard');
	}

	return {};
};

export const actions: Actions = {
	login: async ({ request, locals }) => {
		try {
			const formData = await request.formData();
			const email = sanitizeString(formData.get('email') as string, 254).toLowerCase();
			const password = formData.get('password') as string;

			if (!email || !password) {
				return fail(400, { error: 'Email and password are required', email });
			}

			const { error } = await locals.supabase.auth.signInWithPassword({ email, password });

			if (error) {
				auditLog(
					{ action: 'auth.login_failure', resourceType: 'user', severity: 'warning', details: { email } },
					{ userId: null }
				);
				return fail(400, { error: error.message, email });
			}

			auditLog(
				{ action: 'auth.login_success', resourceType: 'user', details: { email } },
				{ userId: null }
			);

			redirect(303, '/dashboard');
		} catch (err) {
			if (isRedirect(err)) {
				throw err;
			}
			console.error('Login error:', err);
			return fail(500, { error: 'An unexpected error occurred. Please try again.', email: '' });
		}
	},

	demo: async () => {
		// Redirect to the /demo route which sets up read-only demo mode
		redirect(303, '/demo');
	}
};

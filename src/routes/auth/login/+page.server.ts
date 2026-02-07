import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const DEMO_EMAIL = 'demo@trooptotask.app';
const DEMO_PASSWORD = 'demo1234';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.session) {
		redirect(303, '/dashboard');
	}
};

export const actions: Actions = {
	login: async ({ request, locals }) => {
		try {
			const formData = await request.formData();
			const email = formData.get('email') as string;
			const password = formData.get('password') as string;

			if (!email || !password) {
				return fail(400, { error: 'Email and password are required', email });
			}

			const { error } = await locals.supabase.auth.signInWithPassword({ email, password });

			if (error) {
				return fail(400, { error: error.message, email });
			}

			redirect(303, '/dashboard');
		} catch (err) {
			if (isRedirect(err)) {
				throw err;
			}
			console.error('Login error:', err);
			return fail(500, { error: 'An unexpected error occurred. Please try again.' });
		}
	},

	demo: async ({ locals }) => {
		try {
			const { error } = await locals.supabase.auth.signInWithPassword({
				email: DEMO_EMAIL,
				password: DEMO_PASSWORD
			});

			if (error) {
				console.error('Demo login error:', error);
				return fail(400, { error: 'Demo account is not available. Please try again later.' });
			}

			redirect(303, '/dashboard');
		} catch (err) {
			if (isRedirect(err)) {
				throw err;
			}
			console.error('Demo error:', err);
			return fail(500, { error: 'An unexpected error occurred. Please try again.' });
		}
	}
};

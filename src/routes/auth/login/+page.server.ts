import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const DEMO_EMAIL = 'demo@trooptotask.app';
const DEMO_PASSWORD = 'demo1234';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.session) {
		throw redirect(303, '/');
	}
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
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

		throw redirect(303, '/');
	},

	demo: async ({ locals }) => {
		const { error } = await locals.supabase.auth.signInWithPassword({
			email: DEMO_EMAIL,
			password: DEMO_PASSWORD
		});

		if (error) {
			return fail(400, { error: 'Demo account is not available. Please try again later.' });
		}

		throw redirect(303, '/');
	}
};

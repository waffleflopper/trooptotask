import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.session) {
		redirect(303, '/dashboard');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;

		if (!email) {
			return fail(400, { error: 'Email is required', email });
		}

		const redirectTo = `${url.origin}/auth/reset-password`;

		const { error } = await locals.supabase.auth.resetPasswordForEmail(email, {
			redirectTo
		});

		if (error) {
			return fail(400, { error: error.message, email });
		}

		return { success: true, email };
	}
};

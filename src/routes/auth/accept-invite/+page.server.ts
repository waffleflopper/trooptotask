import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { validatePassword } from '$lib/server/validation';
import { autoAcceptOrgInvites } from '$lib/server/auto-accept-org-invites';

export const load: PageServerLoad = async ({ locals }) => {
	// If user already has a full session with password set, redirect to dashboard
	if (locals.session) {
		const { data: { user } } = await locals.supabase.auth.getUser();
		// If user exists and has confirmed their email, they're fully set up
		if (user?.email_confirmed_at) {
			redirect(303, '/dashboard');
		}
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const formData = await request.formData();
		const password = formData.get('password') as string;
		const confirmPassword = formData.get('confirmPassword') as string;

		const passwordError = validatePassword(password);
		if (passwordError) {
			return fail(400, { error: passwordError });
		}

		if (password !== confirmPassword) {
			return fail(400, { error: 'Passwords do not match' });
		}

		// Update the user's password (user is authenticated via invite token exchange)
		const { error: updateError } = await locals.supabase.auth.updateUser({ password });

		if (updateError) {
			return fail(400, { error: updateError.message });
		}

		// Get the current user for auto-accept
		const { data: { user } } = await locals.supabase.auth.getUser();

		if (user) {
			await autoAcceptOrgInvites(locals.supabase, user.id, user.email ?? '');
		}

		redirect(303, '/dashboard');
	}
};

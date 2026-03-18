import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { validatePassword } from '$lib/server/validation';
import { autoAcceptOrgInvites } from '$lib/server/auto-accept-org-invites';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Exchange PKCE code for session if present
	const code = url.searchParams.get('code');
	if (code) {
		await locals.supabase.auth.exchangeCodeForSession(code);
	}

	const {
		data: { user }
	} = await locals.supabase.auth.getUser();

	return { hasSession: !!user };
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
		const {
			data: { user }
		} = await locals.supabase.auth.getUser();

		if (user) {
			await autoAcceptOrgInvites(locals.supabase, user.id, user.email ?? '');
		}

		redirect(303, '/dashboard');
	}
};

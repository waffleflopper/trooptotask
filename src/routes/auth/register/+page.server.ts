import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.session) {
		redirect(303, '/dashboard');
	}

	// Get prefill values from URL params
	const inviteCode = url.searchParams.get('code') ?? '';
	const email = url.searchParams.get('email') ?? '';

	return { inviteCode, email };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const formData = await request.formData();
		const inviteCode = (formData.get('inviteCode') as string)?.trim();
		const email = formData.get('email') as string;
		const password = formData.get('password') as string;
		const confirmPassword = formData.get('confirmPassword') as string;

		if (!inviteCode) {
			return fail(400, { error: 'Invite code is required', email, inviteCode });
		}

		if (!email || !password) {
			return fail(400, { error: 'Email and password are required', email, inviteCode });
		}

		if (password.length < 6) {
			return fail(400, { error: 'Password must be at least 6 characters', email, inviteCode });
		}

		if (password !== confirmPassword) {
			return fail(400, { error: 'Passwords do not match', email, inviteCode });
		}

		// Validate invite code
		const { data: invite, error: inviteError } = await locals.supabase
			.from('registration_invites')
			.select('*')
			.eq('code', inviteCode)
			.is('used_by', null)
			.single();

		if (inviteError || !invite) {
			return fail(400, { error: 'Invalid or already used invite code', email, inviteCode });
		}

		// Check if invite is expired
		if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
			return fail(400, { error: 'This invite code has expired', email, inviteCode });
		}

		// Check if invite is restricted to specific email
		if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
			return fail(400, { error: 'This invite code is for a different email address', email, inviteCode });
		}

		const { data: signUpData, error } = await locals.supabase.auth.signUp({ email, password });

		if (error) {
			return fail(400, { error: error.message, email, inviteCode });
		}

		// Mark invite as used - use the user from signup response
		const newUser = signUpData.user;
		if (newUser) {
			await locals.supabase
				.from('registration_invites')
				.update({ used_by: newUser.id, used_at: new Date().toISOString() })
				.eq('code', inviteCode);
		}

		// After signup, auto-accept any pending clinic invitations for this email
		if (newUser) {
			const { data: invitations } = await locals.supabase
				.from('clinic_invitations')
				.select('clinic_id')
				.eq('email', email.toLowerCase())
				.eq('status', 'pending');

			if (invitations && invitations.length > 0) {
				for (const inv of invitations) {
					await locals.supabase.from('clinic_memberships').insert({
						clinic_id: inv.clinic_id,
						user_id: newUser.id,
						email: email.toLowerCase(),
						role: 'member'
					});
				}
				await locals.supabase
					.from('clinic_invitations')
					.update({ status: 'accepted' })
					.eq('email', email.toLowerCase())
					.eq('status', 'pending');
			}
		}

		// Check if email confirmation is required
		// If there's a user but no session, email confirmation is pending
		if (signUpData.user && !signUpData.session) {
			return { success: true, confirmEmail: true, email };
		}

		redirect(303, '/dashboard');
	}
};

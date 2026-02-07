import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.session) {
		throw redirect(303, '/');
	}
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

		const { error } = await locals.supabase.auth.signUp({ email, password });

		if (error) {
			return fail(400, { error: error.message, email, inviteCode });
		}

		// Mark invite as used
		const { data: { user } } = await locals.supabase.auth.getUser();
		if (user) {
			await locals.supabase
				.from('registration_invites')
				.update({ used_by: user.id, used_at: new Date().toISOString() })
				.eq('code', inviteCode);
		}

		// After signup, auto-accept any pending invitations for this email
		const { data: invitations } = await locals.supabase
			.from('clinic_invitations')
			.select('clinic_id')
			.eq('email', email.toLowerCase())
			.eq('status', 'pending');

		if (invitations && invitations.length > 0) {
			// Get the newly created user
			const { data: { user } } = await locals.supabase.auth.getUser();
			if (user) {
				for (const inv of invitations) {
					await locals.supabase.from('clinic_memberships').insert({
						clinic_id: inv.clinic_id,
						user_id: user.id,
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

		throw redirect(303, '/');
	}
};

import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { clinicId, userRole } = await parent();

	// Get clinic details
	const { data: clinic } = await locals.supabase
		.from('clinics')
		.select('id, name')
		.eq('id', clinicId)
		.single();

	// Get members
	const { data: memberships } = await locals.supabase
		.from('clinic_memberships')
		.select('id, user_id, role, created_at')
		.eq('clinic_id', clinicId);

	// Get user emails from auth (we need to use a workaround since we can't directly query auth.users)
	// For now, we'll display user IDs - in production you'd use a user profile table
	const members = (memberships ?? []).map((m: any) => ({
		id: m.id,
		userId: m.user_id,
		role: m.role,
		createdAt: m.created_at
	}));

	// Get pending invitations
	const { data: invitations } = await locals.supabase
		.from('clinic_invitations')
		.select('id, email, status, created_at')
		.eq('clinic_id', clinicId)
		.eq('status', 'pending');

	return {
		clinic,
		members,
		invitations: invitations ?? [],
		isOwner: userRole === 'owner'
	};
};

export const actions: Actions = {
	updateName: async ({ params, request, locals, url }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { clinicId } = params;
		const formData = await request.formData();
		const name = (formData.get('name') as string)?.trim();

		if (!name) {
			return fail(400, { error: 'Clinic name is required' });
		}

		const { error } = await locals.supabase
			.from('clinics')
			.update({ name })
			.eq('id', clinicId);

		if (error) {
			return fail(500, { error: error.message });
		}

		return { success: true };
	},

	invite: async ({ params, request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { clinicId } = params;
		const formData = await request.formData();
		const email = (formData.get('email') as string)?.trim().toLowerCase();

		if (!email) {
			return fail(400, { inviteError: 'Email is required' });
		}

		// Check if already a member (would need user profile table to check by email)
		// For now, just check if invitation exists
		const { data: existing } = await locals.supabase
			.from('clinic_invitations')
			.select('id')
			.eq('clinic_id', clinicId)
			.eq('email', email)
			.eq('status', 'pending')
			.single();

		if (existing) {
			return fail(400, { inviteError: 'An invitation for this email is already pending' });
		}

		const { error } = await locals.supabase
			.from('clinic_invitations')
			.insert({
				clinic_id: clinicId,
				email,
				invited_by: user.id
			});

		if (error) {
			return fail(500, { inviteError: error.message });
		}

		return { inviteSuccess: true };
	},

	revokeInvite: async ({ params, request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { clinicId } = params;
		const formData = await request.formData();
		const inviteId = formData.get('inviteId') as string;

		await locals.supabase
			.from('clinic_invitations')
			.update({ status: 'revoked' })
			.eq('id', inviteId)
			.eq('clinic_id', clinicId);

		return { success: true };
	},

	removeMember: async ({ params, request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { clinicId } = params;
		const formData = await request.formData();
		const membershipId = formData.get('membershipId') as string;

		// Don't allow removing self
		const { data: membership } = await locals.supabase
			.from('clinic_memberships')
			.select('user_id')
			.eq('id', membershipId)
			.single();

		if (membership?.user_id === user.id) {
			return fail(400, { memberError: 'You cannot remove yourself from the clinic' });
		}

		await locals.supabase
			.from('clinic_memberships')
			.delete()
			.eq('id', membershipId)
			.eq('clinic_id', clinicId);

		return { success: true };
	}
};

import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { PERMISSION_PRESETS } from '$lib/types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	// Allow forcing dashboard view with ?show=all
	const forceShow = url.searchParams.get('show') === 'all';

	// Get clinics the user belongs to
	const { data: memberships } = await locals.supabase
		.from('clinic_memberships')
		.select('clinic_id, role, clinics(id, name)')
		.eq('user_id', user.id);

	const clinics = (memberships ?? [])
		.filter((m: any) => m.clinics)
		.map((m: any) => ({
			id: m.clinics.id,
			name: m.clinics.name,
			role: m.role
		}));

	// Get pending invitations for this user's email
	const { data: invitations, error: inviteError } = await locals.supabase
		.from('clinic_invitations')
		.select('id, clinic_id, email, status, created_at, clinics(id, name)')
		.eq('email', user.email?.toLowerCase())
		.eq('status', 'pending')
		.order('created_at', { ascending: false });

	const pendingInvitations = (invitations ?? [])
		.filter((inv: any) => inv.clinics)
		.map((inv: any) => ({
			id: inv.id,
			clinicId: inv.clinic_id,
			clinicName: inv.clinics.name,
			createdAt: inv.created_at
		}));

	// If user has exactly one clinic AND no pending invitations, redirect directly
	// (unless forceShow is set)
	if (!forceShow && clinics.length === 1 && pendingInvitations.length === 0) {
		throw redirect(303, `/clinic/${clinics[0].id}`);
	}

	// If user has no clinics and no pending invitations, redirect to create one
	if (!forceShow && clinics.length === 0 && pendingInvitations.length === 0) {
		throw redirect(303, '/clinic/new');
	}

	return { clinics, pendingInvitations };
};

export const actions: Actions = {
	acceptInvitation: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		const invitationId = formData.get('invitationId') as string;

		if (!invitationId) {
			return fail(400, { error: 'Invitation ID required' });
		}

		// Get the invitation
		const { data: invitation, error: fetchError } = await locals.supabase
			.from('clinic_invitations')
			.select('*')
			.eq('id', invitationId)
			.eq('email', user.email?.toLowerCase())
			.single();

		if (fetchError || !invitation) {
			return fail(404, { error: 'Invitation not found' });
		}

		// Check if already a member
		const { data: existing } = await locals.supabase
			.from('clinic_memberships')
			.select('id')
			.eq('clinic_id', invitation.clinic_id)
			.eq('user_id', user.id)
			.single();

		if (existing) {
			// Already a member, just delete the invitation
			await locals.supabase
				.from('clinic_invitations')
				.delete()
				.eq('id', invitationId);
			return fail(400, { error: 'You are already a member of this clinic' });
		}

		// Create membership with the invitation's permissions
		const { error: memberError } = await locals.supabase
			.from('clinic_memberships')
			.insert({
				clinic_id: invitation.clinic_id,
				user_id: user.id,
				email: user.email?.toLowerCase(),
				role: 'member',
				can_view_calendar: invitation.can_view_calendar ?? true,
				can_edit_calendar: invitation.can_edit_calendar ?? true,
				can_view_personnel: invitation.can_view_personnel ?? true,
				can_edit_personnel: invitation.can_edit_personnel ?? true,
				can_view_training: invitation.can_view_training ?? true,
				can_edit_training: invitation.can_edit_training ?? true,
				can_manage_members: invitation.can_manage_members ?? false
			});

		if (memberError) {
			return fail(500, { error: 'Failed to accept invitation' });
		}

		// Delete the invitation
		await locals.supabase
			.from('clinic_invitations')
			.delete()
			.eq('id', invitationId);

		return { success: true, accepted: true };
	},

	declineInvitation: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		const invitationId = formData.get('invitationId') as string;

		if (!invitationId) {
			return fail(400, { error: 'Invitation ID required' });
		}

		// Delete the invitation
		const { error } = await locals.supabase
			.from('clinic_invitations')
			.delete()
			.eq('id', invitationId)
			.eq('email', user.email?.toLowerCase());

		if (error) {
			return fail(500, { error: 'Failed to decline invitation' });
		}

		return { success: true, declined: true };
	}
};

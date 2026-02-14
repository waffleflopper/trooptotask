import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { PERMISSION_PRESETS, type OrganizationMember, type PermissionPreset } from '$lib/types';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { orgId, orgName, userRole, permissions, allOrgs } = await parent();

	// Get organization details
	const { data: organization } = await locals.supabase
		.from('organizations')
		.select('id, name')
		.eq('id', orgId)
		.single();

	// Get members with full permission data
	const { data: memberships } = await locals.supabase
		.from('organization_memberships')
		.select(
			'id, user_id, email, role, created_at, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_manage_members'
		)
		.eq('organization_id', orgId);

	// Map to OrganizationMember type
	const members: OrganizationMember[] = (memberships ?? []).map((m: any) => ({
		id: m.id,
		organizationId: orgId,
		userId: m.user_id,
		email: m.email,
		role: m.role,
		createdAt: m.created_at,
		canViewCalendar: m.can_view_calendar,
		canEditCalendar: m.can_edit_calendar,
		canViewPersonnel: m.can_view_personnel,
		canEditPersonnel: m.can_edit_personnel,
		canViewTraining: m.can_view_training,
		canEditTraining: m.can_edit_training,
		canManageMembers: m.can_manage_members
	}));

	// Get pending invitations with permissions
	const { data: invitations } = await locals.supabase
		.from('organization_invitations')
		.select(
			'id, email, status, created_at, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_manage_members'
		)
		.eq('organization_id', orgId)
		.eq('status', 'pending');

	const mappedInvitations = (invitations ?? []).map((inv: any) => ({
		id: inv.id,
		email: inv.email,
		status: inv.status,
		createdAt: inv.created_at,
		canViewCalendar: inv.can_view_calendar,
		canEditCalendar: inv.can_edit_calendar,
		canViewPersonnel: inv.can_view_personnel,
		canEditPersonnel: inv.can_edit_personnel,
		canViewTraining: inv.can_view_training,
		canEditTraining: inv.can_edit_training,
		canManageMembers: inv.can_manage_members
	}));

	return {
		orgId,
		orgName,
		permissions,
		allOrgs,
		organization,
		members,
		invitations: mappedInvitations,
		isOwner: userRole === 'owner',
		canManageMembers: permissions.canManageMembers
	};
};

export const actions: Actions = {
	updateName: async ({ params, request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { orgId } = params;
		const formData = await request.formData();
		const name = (formData.get('name') as string)?.trim();

		if (!name) {
			return fail(400, { error: 'Organization name is required' });
		}

		const { error } = await locals.supabase
			.from('organizations')
			.update({ name })
			.eq('id', orgId);

		if (error) {
			return fail(500, { error: error.message });
		}

		return { success: true };
	},

	invite: async ({ params, request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { orgId } = params;
		const formData = await request.formData();
		const email = (formData.get('email') as string)?.trim().toLowerCase();
		const preset = formData.get('preset') as Exclude<PermissionPreset, 'owner' | 'custom'>;

		if (!email) {
			return fail(400, { inviteError: 'Email is required' });
		}

		// Check if already a member (would need user profile table to check by email)
		// For now, just check if invitation exists
		const { data: existing } = await locals.supabase
			.from('organization_invitations')
			.select('id')
			.eq('organization_id', orgId)
			.eq('email', email)
			.eq('status', 'pending')
			.single();

		if (existing) {
			return fail(400, { inviteError: 'An invitation for this email is already pending' });
		}

		// Get permissions from preset
		const permissions = PERMISSION_PRESETS[preset] || PERMISSION_PRESETS['full-editor'];

		const { error } = await locals.supabase.from('organization_invitations').insert({
			organization_id: orgId,
			email,
			invited_by: user.id,
			can_view_calendar: permissions.canViewCalendar,
			can_edit_calendar: permissions.canEditCalendar,
			can_view_personnel: permissions.canViewPersonnel,
			can_edit_personnel: permissions.canEditPersonnel,
			can_view_training: permissions.canViewTraining,
			can_edit_training: permissions.canEditTraining,
			can_manage_members: permissions.canManageMembers
		});

		if (error) {
			return fail(500, { inviteError: error.message });
		}

		return {
			inviteSuccess: true,
			inviteEmail: email,
			inviteMessage: 'Invitation created! Tell the user to log in to Troop to Task - they will see the invitation on their dashboard.'
		};
	},

	revokeInvite: async ({ params, request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { orgId } = params;
		const formData = await request.formData();
		const inviteId = formData.get('inviteId') as string;

		await locals.supabase
			.from('organization_invitations')
			.update({ status: 'revoked' })
			.eq('id', inviteId)
			.eq('organization_id', orgId);

		return { success: true };
	},

	removeMember: async ({ params, request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { orgId } = params;
		const formData = await request.formData();
		const membershipId = formData.get('membershipId') as string;

		// Don't allow removing self
		const { data: membership } = await locals.supabase
			.from('organization_memberships')
			.select('user_id, role')
			.eq('id', membershipId)
			.single();

		if (membership?.user_id === user.id) {
			return fail(400, { memberError: 'You cannot remove yourself from the organization' });
		}

		// Don't allow removing owner
		if (membership?.role === 'owner') {
			return fail(400, { memberError: 'Cannot remove the organization owner' });
		}

		await locals.supabase
			.from('organization_memberships')
			.delete()
			.eq('id', membershipId)
			.eq('organization_id', orgId);

		return { success: true };
	},

	updatePermissions: async ({ params, request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { orgId } = params;
		const formData = await request.formData();
		const membershipId = formData.get('membershipId') as string;
		const preset = formData.get('preset') as PermissionPreset;

		// Check target membership is not owner
		const { data: targetMembership } = await locals.supabase
			.from('organization_memberships')
			.select('role')
			.eq('id', membershipId)
			.single();

		if (targetMembership?.role === 'owner') {
			return fail(400, { permissionError: 'Cannot modify owner permissions' });
		}

		let permissions: {
			can_view_calendar: boolean;
			can_edit_calendar: boolean;
			can_view_personnel: boolean;
			can_edit_personnel: boolean;
			can_view_training: boolean;
			can_edit_training: boolean;
			can_manage_members: boolean;
		};

		if (preset === 'custom') {
			// Use individual checkboxes
			permissions = {
				can_view_calendar: formData.get('canViewCalendar') === 'on',
				can_edit_calendar: formData.get('canEditCalendar') === 'on',
				can_view_personnel: formData.get('canViewPersonnel') === 'on',
				can_edit_personnel: formData.get('canEditPersonnel') === 'on',
				can_view_training: formData.get('canViewTraining') === 'on',
				can_edit_training: formData.get('canEditTraining') === 'on',
				can_manage_members: formData.get('canManageMembers') === 'on'
			};
		} else {
			// Use preset
			const presetPermissions =
				PERMISSION_PRESETS[preset as Exclude<PermissionPreset, 'owner' | 'custom'>] ||
				PERMISSION_PRESETS['full-editor'];
			permissions = {
				can_view_calendar: presetPermissions.canViewCalendar,
				can_edit_calendar: presetPermissions.canEditCalendar,
				can_view_personnel: presetPermissions.canViewPersonnel,
				can_edit_personnel: presetPermissions.canEditPersonnel,
				can_view_training: presetPermissions.canViewTraining,
				can_edit_training: presetPermissions.canEditTraining,
				can_manage_members: presetPermissions.canManageMembers
			};
		}

		const { error } = await locals.supabase
			.from('organization_memberships')
			.update(permissions)
			.eq('id', membershipId)
			.eq('organization_id', orgId);

		if (error) {
			return fail(500, { permissionError: error.message });
		}

		return { permissionSuccess: true };
	},

	transferOwnership: async ({ params, request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { orgId } = params;
		const formData = await request.formData();
		const newOwnerId = formData.get('newOwnerId') as string;

		// Call the RPC function
		const { error } = await locals.supabase.rpc('transfer_org_ownership', {
			p_organization_id: orgId,
			p_new_owner_id: newOwnerId
		});

		if (error) {
			return fail(500, { transferError: error.message });
		}

		return { transferSuccess: true };
	},

	deleteOrganization: async ({ params, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { orgId } = params;

		// Verify user is the owner
		const { data: membership } = await locals.supabase
			.from('organization_memberships')
			.select('role')
			.eq('organization_id', orgId)
			.eq('user_id', user.id)
			.single();

		if (membership?.role !== 'owner') {
			return fail(403, { deleteError: 'Only the owner can delete the organization' });
		}

		// Delete the organization (cascades to all related data)
		const { error } = await locals.supabase
			.from('organizations')
			.delete()
			.eq('id', orgId);

		if (error) {
			return fail(500, { deleteError: error.message });
		}

		// Redirect to dashboard after deletion
		throw redirect(303, '/dashboard?show=all');
	}
};

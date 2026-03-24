import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { PERMISSION_PRESETS, type OrganizationMember, type PermissionPreset } from '$lib/types';
import { isBillingEnabled } from '$lib/config/billing';
import { getEffectiveTier, getMonthlyExportCount } from '$lib/server/subscription';
import { TIER_CONFIG } from '$lib/types/subscription';
import { createPermissionContext } from '$lib/server/permissionContext';
import { sanitizeString, validateEmail, validateUUID } from '$lib/server/validation';
import { auditLog } from '$lib/server/auditLog';
import { createSupabaseNotificationAdapter } from '$lib/server/adapters/supabaseNotification';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { orgId, orgName, userRole, permissions: _permissions, allOrgs, isAdmin, groups: _groups } = await parent();
	const permissions = _permissions!;
	const groups = _groups ?? [];

	// Parallelize members + invitations queries
	const [membershipsRes, invitationsRes] = await Promise.all([
		locals.supabase
			.from('organization_memberships')
			.select(
				'id, user_id, email, role, scoped_group_id, created_at, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book, can_manage_members'
			)
			.eq('organization_id', orgId),
		locals.supabase
			.from('organization_invitations')
			.select(
				'id, email, status, created_at, scoped_group_id, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book, can_manage_members'
			)
			.eq('organization_id', orgId)
			.eq('status', 'pending')
	]);

	const members = (membershipsRes.data ?? []).map((m: Record<string, unknown>) => ({
		id: m.id as string,
		organizationId: orgId,
		userId: m.user_id as string,
		email: m.email as string,
		role: m.role as string,
		scopedGroupId: m.scoped_group_id as string | null,
		createdAt: m.created_at as string,
		canViewCalendar: m.can_view_calendar as boolean,
		canEditCalendar: m.can_edit_calendar as boolean,
		canViewPersonnel: m.can_view_personnel as boolean,
		canEditPersonnel: m.can_edit_personnel as boolean,
		canViewTraining: m.can_view_training as boolean,
		canEditTraining: m.can_edit_training as boolean,
		canViewOnboarding: m.can_view_onboarding as boolean,
		canEditOnboarding: m.can_edit_onboarding as boolean,
		canViewLeadersBook: m.can_view_leaders_book as boolean,
		canEditLeadersBook: m.can_edit_leaders_book as boolean,
		canManageMembers: m.can_manage_members as boolean
	})) as OrganizationMember[];

	const invitations = (invitationsRes.data ?? []).map((inv: Record<string, unknown>) => ({
		id: inv.id as string,
		email: inv.email as string,
		status: inv.status as string,
		createdAt: inv.created_at as string,
		scopedGroupId: inv.scoped_group_id as string | null,
		canViewCalendar: inv.can_view_calendar as boolean,
		canEditCalendar: inv.can_edit_calendar as boolean,
		canViewPersonnel: inv.can_view_personnel as boolean,
		canEditPersonnel: inv.can_edit_personnel as boolean,
		canViewTraining: inv.can_view_training as boolean,
		canEditTraining: inv.can_edit_training as boolean,
		canViewOnboarding: inv.can_view_onboarding as boolean,
		canEditOnboarding: inv.can_edit_onboarding as boolean,
		canViewLeadersBook: inv.can_view_leaders_book as boolean,
		canEditLeadersBook: inv.can_edit_leaders_book as boolean,
		canManageMembers: inv.can_manage_members as boolean
	}));

	// Load export rate limit info
	let exportInfo: { exportsUsed: number; exportsLimit: number; isLimited: boolean } = {
		exportsUsed: 0,
		exportsLimit: Infinity,
		isLimited: false
	};

	if (isBillingEnabled) {
		const [tier, exportCount] = await Promise.all([
			getEffectiveTier(locals.supabase, orgId),
			getMonthlyExportCount(locals.supabase, orgId)
		]);
		const config = TIER_CONFIG[tier.tier];
		exportInfo = {
			exportsUsed: exportCount,
			exportsLimit: config.bulkExportsPerMonth,
			isLimited: config.bulkExportsPerMonth !== Infinity
		};
	}

	return {
		orgId,
		orgName,
		permissions,
		allOrgs,
		members,
		invitations,
		isOwner: userRole === 'owner',
		isAdmin,
		canManageMembers: permissions.canManageMembers,
		groups: groups.map((g) => ({ id: g.id, name: g.name })),
		exportInfo
	};
};

export const actions: Actions = {
	updateName: async ({ params, request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { orgId } = params;
		const ctx = await createPermissionContext(locals.supabase, user.id, orgId);
		ctx.requireManageMembers();
		const formData = await request.formData();
		const name = sanitizeString(formData.get('name') as string, 100);

		if (!name) {
			return fail(400, { error: 'Organization name is required' });
		}

		const { error } = await locals.supabase.from('organizations').update({ name }).eq('id', orgId);

		if (error) {
			return fail(500, { error: error.message });
		}

		return { success: true };
	},

	invite: async ({ params, request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { orgId } = params;
		const ctx = await createPermissionContext(locals.supabase, user.id, orgId);
		ctx.requireManageMembers();
		const formData = await request.formData();
		const email = sanitizeString(formData.get('email') as string, 254).toLowerCase();
		const preset = formData.get('preset') as Exclude<PermissionPreset, 'owner' | 'custom'>;

		if (!validateEmail(email)) {
			return fail(400, { inviteError: 'Please enter a valid email address' });
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

		// Read scoped group ID for team-leader preset
		const scopedGroupId = (formData.get('scopedGroupId') as string) || null;

		const { error } = await locals.supabase.from('organization_invitations').insert({
			organization_id: orgId,
			email,
			invited_by: user.id,
			scoped_group_id: preset === 'team-leader' ? scopedGroupId : null,
			can_view_calendar: permissions.canViewCalendar,
			can_edit_calendar: permissions.canEditCalendar,
			can_view_personnel: permissions.canViewPersonnel,
			can_edit_personnel: permissions.canEditPersonnel,
			can_view_training: permissions.canViewTraining,
			can_edit_training: permissions.canEditTraining,
			can_view_onboarding: permissions.canViewOnboarding,
			can_edit_onboarding: permissions.canEditOnboarding,
			can_view_leaders_book: permissions.canViewLeadersBook,
			can_edit_leaders_book: permissions.canEditLeadersBook,
			can_manage_members: permissions.canManageMembers
		});

		if (error) {
			return fail(500, { inviteError: error.message });
		}

		auditLog({ action: 'member.invite', resourceType: 'organization', orgId, details: { email } }, { userId: user.id });

		await createSupabaseNotificationAdapter().notifyAdmins(orgId, user.id, {
			type: 'member_invited',
			title: 'Member Invited',
			message: `"${user.email}" invited "${email}" to the organization.`,
			link: `/org/${orgId}/settings`
		});

		return {
			inviteSuccess: true,
			inviteEmail: email,
			inviteMessage:
				'Invitation created! Tell the user to log in to Troop to Task - they will see the invitation on their dashboard.'
		};
	},

	revokeInvite: async ({ params, request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { orgId } = params;
		const ctx = await createPermissionContext(locals.supabase, user.id, orgId);
		ctx.requireManageMembers();
		const formData = await request.formData();
		const inviteId = formData.get('inviteId') as string;

		if (!validateUUID(inviteId)) {
			return fail(400, { error: 'Invalid invitation ID' });
		}

		await locals.supabase.from('organization_invitations').delete().eq('id', inviteId).eq('organization_id', orgId);

		auditLog(
			{ action: 'member.invite_revoked', resourceType: 'organization', orgId, details: { inviteId } },
			{ userId: user.id }
		);

		return { success: true };
	},

	removeMember: async ({ params, request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { orgId } = params;

		const ctx = await createPermissionContext(locals.supabase, user.id, orgId);
		ctx.requireManageMembers();

		const formData = await request.formData();
		const membershipId = formData.get('membershipId') as string;

		if (!validateUUID(membershipId)) {
			return fail(400, { memberError: 'Invalid membership ID' });
		}

		// Don't allow removing self
		const { data: membership } = await locals.supabase
			.from('organization_memberships')
			.select('user_id, role, email')
			.eq('id', membershipId)
			.single();

		if (membership?.user_id === user.id) {
			return fail(400, { memberError: 'You cannot remove yourself from the organization' });
		}

		// Don't allow removing owner
		if (membership?.role === 'owner') {
			return fail(400, { memberError: 'Cannot remove the organization owner' });
		}

		await locals.supabase.from('organization_memberships').delete().eq('id', membershipId).eq('organization_id', orgId);

		auditLog(
			{ action: 'member.removed', resourceType: 'organization', orgId, details: { membershipId } },
			{ userId: user.id }
		);

		if (membership?.user_id) {
			const { data: org } = await locals.supabase.from('organizations').select('name').eq('id', orgId).single();

			await createSupabaseNotificationAdapter().notifyUser(orgId, membership.user_id, {
				type: 'member_removed',
				title: 'Removed from Organization',
				message: `You have been removed from "${org?.name ?? 'the organization'}".`
			});

			await createSupabaseNotificationAdapter().notifyAdmins(orgId, user.id, {
				type: 'member_removed',
				title: 'Member Removed',
				message: `"${user.email}" removed "${membership.email}" from the organization.`,
				link: `/org/${orgId}/settings`
			});
		}

		return { success: true };
	},

	updatePermissions: async ({ params, request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { orgId } = params;
		const formData = await request.formData();
		const membershipId = formData.get('membershipId') as string;
		const preset = formData.get('preset') as PermissionPreset;

		if (!validateUUID(membershipId)) {
			return fail(400, { permissionError: 'Invalid membership ID' });
		}

		// Check target membership is not owner
		const { data: targetMembership } = await locals.supabase
			.from('organization_memberships')
			.select('role, user_id')
			.eq('id', membershipId)
			.single();

		if (targetMembership?.role === 'owner') {
			return fail(400, { permissionError: 'Cannot modify owner permissions' });
		}

		// Only owners can change admin roles
		const ctx = await createPermissionContext(locals.supabase, user.id, orgId);
		if (preset === 'admin' || targetMembership?.role === 'admin') {
			ctx.requireOwner();
		} else {
			ctx.requireManageMembers();
		}

		let permissions: {
			can_view_calendar: boolean;
			can_edit_calendar: boolean;
			can_view_personnel: boolean;
			can_edit_personnel: boolean;
			can_view_training: boolean;
			can_edit_training: boolean;
			can_view_onboarding: boolean;
			can_edit_onboarding: boolean;
			can_view_leaders_book: boolean;
			can_edit_leaders_book: boolean;
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
				can_view_onboarding: formData.get('canViewOnboarding') === 'on',
				can_edit_onboarding: formData.get('canEditOnboarding') === 'on',
				can_view_leaders_book: formData.get('canViewLeadersBook') === 'on',
				can_edit_leaders_book: formData.get('canEditLeadersBook') === 'on',
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
				can_view_onboarding: presetPermissions.canViewOnboarding,
				can_edit_onboarding: presetPermissions.canEditOnboarding,
				can_view_leaders_book: presetPermissions.canViewLeadersBook,
				can_edit_leaders_book: presetPermissions.canEditLeadersBook,
				can_manage_members: presetPermissions.canManageMembers
			};
		}

		// Determine role and scoped_group_id based on preset
		const role = preset === 'admin' ? 'admin' : 'member';
		const scopedGroupId = preset === 'team-leader' ? (formData.get('scopedGroupId') as string) || null : null;

		const { error } = await locals.supabase
			.from('organization_memberships')
			.update({ ...permissions, role, scoped_group_id: scopedGroupId })
			.eq('id', membershipId)
			.eq('organization_id', orgId);

		if (error) {
			return fail(500, { permissionError: error.message });
		}

		auditLog(
			{
				action: 'member.permissions_changed',
				resourceType: 'organization',
				orgId,
				severity: 'warning',
				details: { membershipId, preset }
			},
			{ userId: user.id }
		);

		const oldRole = targetMembership?.role;
		const newRole = role;

		const { data: permOrg } = await locals.supabase.from('organizations').select('name').eq('id', orgId).single();
		const orgName = permOrg?.name ?? 'the organization';

		if (targetMembership?.user_id && targetMembership.user_id !== user.id) {
			if (oldRole !== newRole) {
				await createSupabaseNotificationAdapter().notifyUser(orgId, targetMembership.user_id, {
					type: 'member_role_changed',
					title: 'Role Updated',
					message: `Your role in "${orgName}" has been changed to ${newRole}.`
				});
			} else {
				await createSupabaseNotificationAdapter().notifyUser(orgId, targetMembership.user_id, {
					type: 'member_permissions_changed',
					title: 'Permissions Updated',
					message: `Your permissions in "${orgName}" have been updated.`
				});
			}
		}

		return { permissionSuccess: true };
	},

	transferOwnership: async ({ params, request, locals }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const { orgId } = params;
		const ctx = await createPermissionContext(locals.supabase, user.id, orgId);
		ctx.requireOwner();
		const formData = await request.formData();
		const newOwnerId = formData.get('newOwnerId') as string;

		if (!validateUUID(newOwnerId)) {
			return fail(400, { transferError: 'Invalid user ID' });
		}

		// Call the RPC function
		const { error } = await locals.supabase.rpc('transfer_org_ownership', {
			p_organization_id: orgId,
			p_new_owner_id: newOwnerId
		});

		if (error) {
			return fail(500, { transferError: error.message });
		}

		auditLog(
			{
				action: 'org.ownership_transferred',
				resourceType: 'organization',
				orgId,
				severity: 'critical',
				details: { newOwnerId }
			},
			{ userId: user.id }
		);

		const { data: transferOrg } = await locals.supabase.from('organizations').select('name').eq('id', orgId).single();

		await createSupabaseNotificationAdapter().notifyUser(orgId, newOwnerId, {
			type: 'ownership_transferred',
			title: 'Ownership Transferred',
			message: `You are now the owner of "${transferOrg?.name ?? 'the organization'}".`,
			link: `/org/${orgId}/settings`
		});

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
		const { error } = await locals.supabase.from('organizations').delete().eq('id', orgId);

		if (error) {
			return fail(500, { deleteError: error.message });
		}

		auditLog({ action: 'org.deleted', resourceType: 'organization', orgId, severity: 'critical' }, { userId: user.id });

		// Redirect to dashboard after deletion
		throw redirect(303, '/dashboard?show=all');
	}
};

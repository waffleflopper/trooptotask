import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { OrganizationMemberPermissions } from '$lib/types';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	const user = locals.user;
	if (!user) throw redirect(303, '/auth/login');

	const { orgId } = params;

	// Verify membership and get permissions
	const { data: membership } = await locals.supabase
		.from('organization_memberships')
		.select(
			'role, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_manage_members'
		)
		.eq('organization_id', orgId)
		.eq('user_id', user.id)
		.single();

	if (!membership) {
		throw error(403, 'You are not a member of this organization');
	}

	// Get organization info
	const { data: org } = await locals.supabase
		.from('organizations')
		.select('id, name')
		.eq('id', orgId)
		.single();

	if (!org) {
		throw error(404, 'Organization not found');
	}

	// Get all organizations the user belongs to (for the org switcher)
	const { data: memberships } = await locals.supabase
		.from('organization_memberships')
		.select('organization_id, role, organizations(id, name)')
		.eq('user_id', user.id);

	const allOrgs = (memberships ?? [])
		.filter((m: any) => m.organizations)
		.map((m: any) => ({
			id: m.organizations.id,
			name: m.organizations.name,
			role: m.role
		}));

	const isOwner = membership.role === 'owner';

	// Build permissions object - owners always have full access
	const permissions: OrganizationMemberPermissions = {
		canViewCalendar: isOwner || membership.can_view_calendar,
		canEditCalendar: isOwner || membership.can_edit_calendar,
		canViewPersonnel: isOwner || membership.can_view_personnel,
		canEditPersonnel: isOwner || membership.can_edit_personnel,
		canViewTraining: isOwner || membership.can_view_training,
		canEditTraining: isOwner || membership.can_edit_training,
		canManageMembers: isOwner || membership.can_manage_members
	};

	return {
		orgId,
		orgName: org.name,
		userRole: membership.role as 'owner' | 'member',
		userId: user.id,
		permissions,
		allOrgs
	};
};

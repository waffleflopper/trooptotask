import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PermissionType = 'calendar' | 'personnel' | 'training';

interface MembershipPermissions {
	role: 'owner' | 'admin' | 'member';
	can_edit_calendar: boolean;
	can_edit_personnel: boolean;
	can_edit_training: boolean;
	scoped_group_id: string | null;
}

function isPrivilegedRole(role: string): boolean {
	return role === 'owner' || role === 'admin';
}

async function getMembershipPermissions(
	supabase: SupabaseClient,
	orgId: string,
	userId: string
): Promise<MembershipPermissions | null> {
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select('role, can_edit_calendar, can_edit_personnel, can_edit_training, scoped_group_id')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	return membership as MembershipPermissions | null;
}

export async function requireEditPermission(
	supabase: SupabaseClient,
	orgId: string,
	userId: string,
	permissionType: PermissionType
): Promise<void> {
	const membership = await getMembershipPermissions(supabase, orgId, userId);

	if (!membership) {
		throw error(403, 'Not a member of this organization');
	}

	// Owners and admins always have full access
	if (isPrivilegedRole(membership.role)) {
		return;
	}

	// Check specific permission
	switch (permissionType) {
		case 'calendar':
			if (!membership.can_edit_calendar) {
				throw error(403, 'You do not have permission to edit calendar data');
			}
			break;
		case 'personnel':
			if (!membership.can_edit_personnel) {
				throw error(403, 'You do not have permission to edit personnel data');
			}
			break;
		case 'training':
			if (!membership.can_edit_training) {
				throw error(403, 'You do not have permission to edit training data');
			}
			break;
	}
}

export async function requireManageMembersPermission(
	supabase: SupabaseClient,
	orgId: string,
	userId: string
): Promise<void> {
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select('role, can_manage_members')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!membership) {
		throw error(403, 'Not a member of this organization');
	}

	if (!isPrivilegedRole(membership.role) && !membership.can_manage_members) {
		throw error(403, 'You do not have permission to manage this organization');
	}
}

export async function requireOwnerRole(
	supabase: SupabaseClient,
	orgId: string,
	userId: string
): Promise<void> {
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select('role')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!membership || membership.role !== 'owner') {
		throw error(403, 'Only the organization owner can perform this action');
	}
}

export async function getScopedGroupId(
	supabase: SupabaseClient,
	orgId: string,
	userId: string
): Promise<string | null> {
	const membership = await getMembershipPermissions(supabase, orgId, userId);
	if (!membership) return null;
	if (isPrivilegedRole(membership.role)) return null;
	return membership.scoped_group_id;
}

export async function requireGroupAccess(
	supabase: SupabaseClient,
	orgId: string,
	userId: string,
	personnelGroupId: string | null
): Promise<void> {
	const scopedGroupId = await getScopedGroupId(supabase, orgId, userId);
	if (!scopedGroupId) return;
	if (personnelGroupId !== scopedGroupId) {
		throw error(403, 'You do not have access to personnel outside your group');
	}
}

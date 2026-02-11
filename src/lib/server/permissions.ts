import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PermissionType = 'calendar' | 'personnel' | 'training';

interface MembershipPermissions {
	role: 'owner' | 'member';
	can_edit_calendar: boolean;
	can_edit_personnel: boolean;
	can_edit_training: boolean;
}

async function getMembershipPermissions(
	supabase: SupabaseClient,
	clinicId: string,
	userId: string
): Promise<MembershipPermissions | null> {
	const { data: membership } = await supabase
		.from('clinic_memberships')
		.select('role, can_edit_calendar, can_edit_personnel, can_edit_training')
		.eq('clinic_id', clinicId)
		.eq('user_id', userId)
		.single();

	return membership as MembershipPermissions | null;
}

export async function requireEditPermission(
	supabase: SupabaseClient,
	clinicId: string,
	userId: string,
	permissionType: PermissionType
): Promise<void> {
	const membership = await getMembershipPermissions(supabase, clinicId, userId);

	if (!membership) {
		throw error(403, 'Not a member of this clinic');
	}

	// Owners always have full access
	if (membership.role === 'owner') {
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

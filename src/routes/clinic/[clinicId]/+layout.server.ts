import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { ClinicMemberPermissions } from '$lib/types';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	const user = locals.user;
	if (!user) throw redirect(303, '/auth/login');

	const { clinicId } = params;

	// Verify membership and get permissions
	const { data: membership } = await locals.supabase
		.from('clinic_memberships')
		.select(
			'role, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_manage_members'
		)
		.eq('clinic_id', clinicId)
		.eq('user_id', user.id)
		.single();

	if (!membership) {
		throw error(403, 'You are not a member of this clinic');
	}

	// Get clinic info
	const { data: clinic } = await locals.supabase
		.from('clinics')
		.select('id, name')
		.eq('id', clinicId)
		.single();

	if (!clinic) {
		throw error(404, 'Clinic not found');
	}

	// Get all clinics the user belongs to (for the clinic switcher)
	const { data: memberships } = await locals.supabase
		.from('clinic_memberships')
		.select('clinic_id, role, clinics(id, name)')
		.eq('user_id', user.id);

	const allClinics = (memberships ?? [])
		.filter((m: any) => m.clinics)
		.map((m: any) => ({
			id: m.clinics.id,
			name: m.clinics.name,
			role: m.role
		}));

	const isOwner = membership.role === 'owner';

	// Build permissions object - owners always have full access
	const permissions: ClinicMemberPermissions = {
		canViewCalendar: isOwner || membership.can_view_calendar,
		canEditCalendar: isOwner || membership.can_edit_calendar,
		canViewPersonnel: isOwner || membership.can_view_personnel,
		canEditPersonnel: isOwner || membership.can_edit_personnel,
		canViewTraining: isOwner || membership.can_view_training,
		canEditTraining: isOwner || membership.can_edit_training,
		canManageMembers: isOwner || membership.can_manage_members
	};

	return {
		clinicId,
		clinicName: clinic.name,
		userRole: membership.role as 'owner' | 'member',
		userId: user.id,
		permissions,
		allClinics
	};
};

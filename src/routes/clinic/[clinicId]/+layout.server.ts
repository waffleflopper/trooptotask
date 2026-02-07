import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	const user = locals.user;
	if (!user) throw redirect(303, '/auth/login');

	const { clinicId } = params;

	// Verify membership
	const { data: membership } = await locals.supabase
		.from('clinic_memberships')
		.select('role')
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

	return {
		clinicId,
		clinicName: clinic.name,
		userRole: membership.role as 'owner' | 'member',
		userId: user.id
	};
};

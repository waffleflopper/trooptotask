import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

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

	// If user has exactly one clinic, redirect directly
	if (clinics.length === 1) {
		throw redirect(303, `/clinic/${clinics[0].id}`);
	}

	// If user has no clinics, redirect to create one
	if (clinics.length === 0) {
		throw redirect(303, '/clinic/new');
	}

	// Multiple clinics - show selector
	return { clinics };
};

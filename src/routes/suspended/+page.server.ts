import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	// If not logged in, redirect to login
	if (!locals.user) throw redirect(302, '/auth/login');

	const { data: isSuspended } = await locals.supabase.rpc('is_user_suspended', {
		check_user_id: locals.user.id
	});
	// If not actually suspended, redirect away
	if (!isSuspended) throw redirect(302, '/dashboard');
};

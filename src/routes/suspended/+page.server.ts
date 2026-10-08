import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { readAccountSuspension } from '$features/identity/index.server';

export const load: PageServerLoad = async ({ locals }) => {
	// If not logged in, redirect to login
	if (!locals.user) throw redirect(302, '/auth/login');

	// If not actually suspended, redirect away
	if (!(await readAccountSuspension(locals, locals.user.id))) throw redirect(302, '/dashboard');
};

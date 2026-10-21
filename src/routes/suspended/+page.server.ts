import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { readAccountSuspension } from '$features/identity/index.server';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/auth/login');

	const suspended = await readAccountSuspension(locals, locals.user.id);
	// Match admission: an unverifiable status is unavailable, not active
	if (suspended === null) throw error(500, 'Unable to verify account status');
	if (!suspended) throw redirect(302, '/dashboard');
};

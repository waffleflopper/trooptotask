import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAuthenticatedRedirectPath } from '$lib/server/mfaGate';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.session) {
		redirect(303, getAuthenticatedRedirectPath(locals.authFlow, locals.mfaPending));
	}
};

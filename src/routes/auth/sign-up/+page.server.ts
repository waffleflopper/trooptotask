import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getAuthenticatedRedirectPath } from '$lib/server/mfaGate';

export const load: PageServerLoad = async ({ locals }) => {
	redirect(
		303,
		locals.session ? getAuthenticatedRedirectPath(locals.authFlow, locals.mfaPending) : '/auth/request-access'
	);
};

export const actions: Actions = {
	default: async ({ locals }) => {
		redirect(
			303,
			locals.session ? getAuthenticatedRedirectPath(locals.authFlow, locals.mfaPending) : '/auth/request-access'
		);
	}
};

import { PASSWORD_COMPLETION_COOKIE } from '$lib/server/passwordCompletion';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getPendingAuthFlowCookieName } from '$lib/server/mfaGate';

export const load: PageServerLoad = async ({ request }) => {
	if (request.method !== 'POST') redirect(303, '/');
	return {};
};

export const actions: Actions = {
	default: async ({ locals, cookies }) => {
		try {
			const result = await locals.supabase.auth.signOut();
			if (result?.error !== null) {
				return fail(503, { error: 'Unable to confirm sign-out. Please try again.' });
			}
		} catch {
			return fail(503, { error: 'Unable to confirm sign-out. Please try again.' });
		}
		cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
		cookies.delete(PASSWORD_COMPLETION_COOKIE, { path: '/' });
		redirect(303, '/');
	}
};

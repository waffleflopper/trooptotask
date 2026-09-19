import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { clearSupabaseAuthCookies, getSupabaseAuthStorageKey } from '$lib/server/authSession';
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
			const sessionResult = await locals.supabase.auth.getSession();
			if (sessionResult?.error !== null || !sessionResult.data) {
				return fail(503, { error: 'Unable to confirm sign-out. Please try again.' });
			}
			if (sessionResult.data.session === null) {
				clearSupabaseAuthCookies(cookies, getSupabaseAuthStorageKey(PUBLIC_SUPABASE_URL));
				cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
				return { localOnly: true };
			}
			const token = sessionResult.data.session?.access_token;
			if (typeof token !== 'string' || !token.trim()) {
				return fail(503, { error: 'Unable to confirm sign-out. Please try again.' });
			}
			// The session helper suppresses 401/403/404; only this explicit-token
			// provider operation can acknowledge global refresh-session revocation.
			const result = await locals.supabase.auth.admin.signOut(token, 'global');
			if (result?.error !== null) {
				return fail(503, { error: 'Unable to confirm sign-out. Please try again.' });
			}
		} catch {
			return fail(503, { error: 'Unable to confirm sign-out. Please try again.' });
		}
		clearSupabaseAuthCookies(cookies, getSupabaseAuthStorageKey(PUBLIC_SUPABASE_URL));
		cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
		redirect(303, '/');
	}
};

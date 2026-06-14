import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getPendingAuthFlowCookieName } from '$lib/server/mfaGate';

export const load: PageServerLoad = async () => {
	redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ locals, cookies }) => {
		await locals.supabase.auth.signOut();
		cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
		redirect(303, '/');
	}
};

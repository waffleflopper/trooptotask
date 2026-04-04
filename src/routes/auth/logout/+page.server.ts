import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPendingAuthFlowCookieName } from '$lib/server/mfaGate';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	await locals.supabase.auth.signOut();
	cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
	redirect(303, '/');
};

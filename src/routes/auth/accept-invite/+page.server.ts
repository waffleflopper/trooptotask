import { passwordCompletionState } from '$lib/server/passwordCompletion';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const {
		data: { session }
	} = await locals.supabase.auth.getSession();

	return { hasSession: !!session?.access_token, passwordCompletion: passwordCompletionState(cookies, locals) };
};

import { passwordCompletionState } from '$lib/server/passwordCompletion';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const {
		data: { session }
	} = await locals.supabase.auth.getSession();

	return { hasSession: !!session?.access_token, passwordCompletion: await passwordCompletionState(locals) };
};

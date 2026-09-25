import { passwordCompletionState } from '$features/identity/index.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const {
		data: { session }
	} = await locals.supabase.auth.getSession();

	return { hasSession: !!session?.access_token, passwordCompletion: await passwordCompletionState(locals) };
};

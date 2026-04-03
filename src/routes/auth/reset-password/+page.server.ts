import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const code = url.searchParams.get('code');
	if (code) {
		const { error: exchangeError } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (exchangeError) {
			console.error('Reset-password code exchange failed:', exchangeError.message);
		}
	}

	const {
		data: { user }
	} = await locals.supabase.auth.getUser();

	return { hasSession: !!user };
};

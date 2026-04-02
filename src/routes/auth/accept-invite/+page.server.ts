import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Exchange PKCE code for session if present
	const code = url.searchParams.get('code');
	if (code) {
		const { error: exchangeError } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (exchangeError) {
			console.error('Accept-invite code exchange failed:', exchangeError.message);
		}
	}

	const {
		data: { user }
	} = await locals.supabase.auth.getUser();

	return { hasSession: !!user };
};

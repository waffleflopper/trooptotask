import { getPendingAuthFlowCookieName } from '$lib/server/mfaGate';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	// Exchange PKCE code for session if present
	const code = url.searchParams.get('code');
	if (code) {
		const { error: exchangeError } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (exchangeError) {
			console.error('Accept-invite code exchange failed:', exchangeError.message);
		} else {
			cookies.set(getPendingAuthFlowCookieName(), 'invite', {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: !import.meta.env.DEV,
				maxAge: 60 * 60
			});
		}
	}

	const {
		data: { user }
	} = await locals.supabase.auth.getUser();

	return { hasSession: !!user };
};

import { setPendingAuthFlowCookie } from '$lib/server/mfaGate';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	// TODO: remove this legacy PKCE code exchange after production email templates
	// are fully rolled over to the app-owned /auth/confirm flow.
	const code = url.searchParams.get('code');
	if (code) {
		const { error: exchangeError } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (exchangeError) {
			console.error('Accept-invite code exchange failed:', exchangeError.message);
		} else {
			setPendingAuthFlowCookie(cookies, 'invite');
		}
	}

	const {
		data: { session }
	} = await locals.supabase.auth.getSession();

	return { hasSession: !!session?.access_token };
};

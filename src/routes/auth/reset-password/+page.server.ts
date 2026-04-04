import { getPendingAuthFlowCookieName } from '$lib/server/mfaGate';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const code = url.searchParams.get('code');
	if (code) {
		const { error: exchangeError } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (exchangeError) {
			console.error('Reset-password code exchange failed:', exchangeError.message);
		} else {
			cookies.set(getPendingAuthFlowCookieName(), 'recovery', {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: !import.meta.env.DEV,
				maxAge: 60 * 60
			});
		}
	}

	const {
		data: { session }
	} = await locals.supabase.auth.getSession();

	return { hasSession: !!session?.access_token };
};

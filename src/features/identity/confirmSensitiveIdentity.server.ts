import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Cookies } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { checkSessionAssurance } from './sessionAssurance.server';
import { getAuthCookieOptions } from './authCookies.server';

type ConfirmationIdentity = {
	user: { id: string; email?: string } | null;
	session: { user: { id: string }; access_token: string; expires_at?: number } | null;
};

export async function confirmSensitiveIdentity(
	{ user, session }: ConfirmationIdentity,
	cookies: Pick<Cookies, 'getAll' | 'set'>,
	password: unknown
): Promise<'inactive' | 'password-required' | 'rejected' | 'unavailable' | 'mfa-required' | 'confirmed'> {
	// This confirms identity only. Every protected action still authorizes its own Organization and scope.
	if (
		!user?.id ||
		!user.email ||
		session?.user?.id !== user.id ||
		!session.access_token ||
		typeof session.expires_at !== 'number' ||
		!Number.isFinite(session.expires_at) ||
		session.expires_at <= Date.now() / 1000
	) {
		return 'inactive';
	}

	if (typeof password !== 'string' || !password) return 'password-required';

	try {
		// Signing in writes session cookies before returning. Stage them so failed proof or assurance
		// cannot replace the browser's current session, including with a different account.
		const staged: { name: string; value: string; options: CookieOptions }[] = [];
		const supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
			cookies: {
				encode: 'tokens-only',
				getAll: () => cookies.getAll(),
				setAll: (values) => {
					staged.push(...values);
				}
			}
		});
		const result = await supabase.auth.signInWithPassword({ email: user.email, password });
		if (result?.error && [400, 401, 403].includes(result.error.status ?? 0)) {
			return 'rejected';
		}
		const data = result?.data;
		const confirmedSession = data?.session;
		if (
			result?.error !== null ||
			data?.user?.id !== user.id ||
			confirmedSession?.user?.id !== user.id ||
			typeof confirmedSession?.access_token !== 'string' ||
			!/^\S+$/.test(confirmedSession.access_token) ||
			typeof confirmedSession.refresh_token !== 'string' ||
			!/^\S+$/.test(confirmedSession.refresh_token) ||
			typeof confirmedSession.expires_at !== 'number' ||
			!Number.isFinite(confirmedSession.expires_at) ||
			confirmedSession.expires_at <= Date.now() / 1000
		)
			return 'unavailable';

		const assurance = await checkSessionAssurance(supabase, confirmedSession);
		if (assurance === 'unavailable' || assurance === 'expired') return 'unavailable';

		for (const { name, value, options } of staged) cookies.set(name, value, getAuthCookieOptions(options));
		if (assurance === 'mfa_required') {
			return 'mfa-required';
		}
		return 'confirmed';
	} catch {
		// Provider exceptions may contain credentials; keep them out of responses and logs.
		return 'unavailable';
	}
}

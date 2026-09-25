import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Cookies } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { getAuthCookieOptions } from '$lib/server/authCookies';
import { setPendingAuthFlowCookie } from './mfaGate.server';

// Session exchange is deliberately request-local. Neither rejected exchanges nor
// incomplete provider results may overwrite the browser's existing identity.
export async function establishIdentitySession(
	cookies: Pick<Cookies, 'getAll' | 'set'>,
	body: unknown
): Promise<'ready' | 'malformed' | 'invalid' | 'unavailable'> {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return 'malformed';
	}
	const { accessToken, refreshToken, flow } = body as Record<string, unknown>;
	if (
		typeof accessToken !== 'string' ||
		!/^\S+$/.test(accessToken) ||
		typeof refreshToken !== 'string' ||
		!/^\S+$/.test(refreshToken) ||
		(flow != null && flow !== 'recovery' && flow !== 'invite')
	) {
		return 'malformed';
	}

	try {
		// Failed exchanges can cause SDK cookie removals. Publish its staged writes
		// only after a usable session is acknowledged, preserving the current browser session on denial.
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
		const result = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
		if (result?.error && [400, 401, 403].includes(result.error.status ?? 0)) {
			return 'invalid';
		}
		const data = result?.data;
		if (
			result?.error !== null ||
			typeof data?.user?.id !== 'string' ||
			!data.user.id ||
			data.session?.user?.id !== data.user.id ||
			typeof data.session?.access_token !== 'string' ||
			!data.session.access_token ||
			typeof data.session?.refresh_token !== 'string' ||
			!data.session.refresh_token
		) {
			return 'unavailable';
		}
		for (const { name, value, options } of staged) {
			cookies.set(name, value, getAuthCookieOptions(options));
		}
		if (flow === 'recovery' || flow === 'invite') setPendingAuthFlowCookie(cookies, flow);
		return 'ready';
	} catch {
		return 'unavailable';
	}
}

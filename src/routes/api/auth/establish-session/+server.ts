import { json } from '@sveltejs/kit';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { RequestHandler } from './$types';
import { setPendingAuthFlowCookie } from '$lib/server/mfaGate';
import { getAuthCookieOptions } from '$lib/server/authCookies';

function reply(body: { ok: true } | { error: string }, status: number) {
	return json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return reply({ error: 'Provide valid session tokens and an authentication flow.' }, 400);
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return reply({ error: 'Provide valid session tokens and an authentication flow.' }, 400);
	}
	const { accessToken, refreshToken, flow } = body as Record<string, unknown>;
	if (
		typeof accessToken !== 'string' ||
		!/^\S+$/.test(accessToken) ||
		typeof refreshToken !== 'string' ||
		!/^\S+$/.test(refreshToken) ||
		(flow != null && flow !== 'recovery' && flow !== 'invite')
	) {
		return reply({ error: 'Provide valid session tokens and an authentication flow.' }, 400);
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
			return reply({ error: 'This session is invalid or expired. Open a fresh link.' }, 401);
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
			return reply({ error: 'Unable to verify this session. Please try again.' }, 503);
		}
		for (const { name, value, options } of staged) {
			cookies.set(name, value, getAuthCookieOptions(options));
		}
		if (flow === 'recovery' || flow === 'invite') setPendingAuthFlowCookie(cookies, flow);
		return reply({ ok: true }, 200);
	} catch {
		return reply({ error: 'Unable to verify this session. Please try again.' }, 503);
	}
};

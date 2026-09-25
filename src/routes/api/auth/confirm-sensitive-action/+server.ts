import { checkSessionAssurance } from '$features/identity/index.server';
import { json } from '@sveltejs/kit';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { RequestHandler } from './$types';
import { getAuthCookieOptions } from '$lib/server/authCookies';

function reply(body: { success: true } | { error?: string; requiresStepUp?: true; stepUpPath?: string }, status = 200) {
	return json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	// This confirms identity only. Every protected action still authorizes its own Organization and scope.
	const { user, session } = locals;
	if (
		!user?.id ||
		!user.email ||
		session?.user?.id !== user.id ||
		!session.access_token ||
		typeof session.expires_at !== 'number' ||
		!Number.isFinite(session.expires_at) ||
		session.expires_at <= Date.now() / 1000
	) {
		return reply(
			{ error: 'Please sign in again before continuing.', requiresStepUp: true, stepUpPath: '/auth/login' },
			401
		);
	}
	const body: unknown = await request.json().catch(() => null);
	const password =
		body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).password : null;
	if (typeof password !== 'string' || !password) return reply({ error: 'Password is required.' }, 400);

	const unavailable = () => reply({ error: 'Unable to confirm your identity. Please try again.' }, 503);
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
			return reply({ error: 'Password confirmation failed. Try again.' }, 401);
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
			return unavailable();

		const assurance = await checkSessionAssurance(supabase, confirmedSession);
		if (assurance === 'unavailable' || assurance === 'expired') return unavailable();

		for (const { name, value, options } of staged) cookies.set(name, value, getAuthCookieOptions(options));
		if (assurance === 'mfa_required') {
			return reply({ requiresStepUp: true, stepUpPath: '/auth/mfa-verify' });
		}
		return reply({ success: true });
	} catch {
		// Provider exceptions may contain credentials; keep them out of responses and logs.
		return unavailable();
	}
};

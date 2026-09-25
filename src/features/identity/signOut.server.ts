import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { Cookies } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPendingAuthFlowCookieName } from '$lib/server/mfaGate';
import { clearSupabaseAuthCookies, getSupabaseAuthStorageKey } from './supabaseSession.server';

// Logout deliberately reads the provider again: it must allow retries even when
// request admission could not establish a session. Cookie deletion is not revocation.
export async function signOutIdentity({
	locals,
	cookies
}: {
	locals: { supabase: SupabaseClient };
	cookies: Cookies;
}): Promise<'unavailable' | 'local-only' | 'revoked'> {
	const { supabase } = locals;
	try {
		const sessionResult = await supabase.auth.getSession();
		if (sessionResult?.error !== null || !sessionResult.data) {
			return 'unavailable';
		}
		if (sessionResult.data.session === null) {
			clearSupabaseAuthCookies(cookies, getSupabaseAuthStorageKey(PUBLIC_SUPABASE_URL));
			cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
			return 'local-only';
		}
		const token = sessionResult.data.session?.access_token;
		if (typeof token !== 'string' || !token.trim()) {
			return 'unavailable';
		}
		// The session helper suppresses 401/403/404; only this explicit-token
		// provider operation can acknowledge global refresh-session revocation.
		const result = await supabase.auth.admin.signOut(token, 'global');
		if (result?.error !== null) {
			return 'unavailable';
		}
	} catch {
		return 'unavailable';
	}
	clearSupabaseAuthCookies(cookies, getSupabaseAuthStorageKey(PUBLIC_SUPABASE_URL));
	cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
	return 'revoked';
}

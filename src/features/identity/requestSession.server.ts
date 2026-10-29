import type { Cookies } from '@sveltejs/kit';
import type { Session, User } from '@supabase/supabase-js';
import type { SupabaseClient } from '$lib/server/database';
import { getPendingAuthFlowCookieName, isPasswordAuthenticatedSession, readAuthSessionMarker } from './mfaGate.server';
import {
	buildTrustedUserFromClaims,
	clearSupabaseAuthCookies,
	getSupabaseAuthStorageKey,
	hasSupabaseAuthCookie,
	readSessionLifetime
} from './supabaseSession.server';

type RequestSessionResult =
	| { status: 'resolved'; session: Session | null; user: User | null }
	| { status: 'unavailable'; reason: 'lifetime' | 'revocation' };

const STALE_SUPABASE_AUTH_ERROR_CODES = new Set([
	'refresh_token_not_found',
	'refresh_token_already_used',
	'session_not_found',
	'session_expired'
]);

// Mirrors auth-js EXPIRY_MARGIN_MS, inside which its next provider call refreshes.
const AUTH_JS_REFRESH_MARGIN_MS = 90_000;
// Covers a streamed load, which can call the provider after cookies stop being writable. No
// maxDuration is configured; 300 s is Vercel's documented default, and the hosted limit is unverified.
const STREAM_REFRESH_ALLOWANCE_MS = 300_000;
const SESSION_REFRESH_AHEAD_MS = AUTH_JS_REFRESH_MARGIN_MS + STREAM_REFRESH_ALLOWANCE_MS;

function getAuthErrorCode(error: unknown): string | null {
	if (!error || typeof error !== 'object' || !('code' in error)) return null;
	return typeof error.code === 'string' ? error.code : null;
}

function isStaleSupabaseAuthError(error: unknown): boolean {
	const code = getAuthErrorCode(error);
	return Boolean(code && STALE_SUPABASE_AUTH_ERROR_CODES.has(code));
}

function buildTrustedSession(session: Session, user: User): Session {
	return {
		access_token: session.access_token,
		refresh_token: session.refresh_token,
		expires_in: session.expires_in,
		expires_at: session.expires_at,
		token_type: session.token_type,
		user
	};
}

// Current Identity transport edge: provider credentials never become feature authority.
// Called once per request; storage belongs to that request's SSR client.
export async function readIdentitySession({
	supabase,
	cookies,
	supabaseUrl,
	isLogout,
	userStorage
}: {
	supabase: SupabaseClient;
	cookies: Cookies;
	supabaseUrl: string;
	isLogout: boolean;
	userStorage: { setItem(key: string, value: string): void | Promise<void> };
}): Promise<RequestSessionResult> {
	const storageKey = getSupabaseAuthStorageKey(supabaseUrl);
	const hasAuthCookie = hasSupabaseAuthCookie(
		cookies.getAll().map(({ name }) => name),
		storageKey
	);

	if (!hasAuthCookie) {
		return { status: 'resolved', session: null, user: null };
	}

	const {
		data: { session: loadedSession },
		error: sessionError
	} = await supabase.auth.getSession().catch((error) => {
		if (isStaleSupabaseAuthError(error)) {
			clearSupabaseAuthCookies(cookies, storageKey);
			return { data: { session: null }, error };
		}
		throw error;
	});

	if (sessionError || !loadedSession?.access_token) {
		if (isStaleSupabaseAuthError(sessionError)) {
			clearSupabaseAuthCookies(cookies, storageKey);
		}
		return { status: 'resolved', session: null, user: null };
	}

	// Rotate now, while the response can still carry the new cookies, rather than inside a stream.
	let session = loadedSession;
	if (session.expires_at !== undefined && session.expires_at * 1000 - Date.now() < SESSION_REFRESH_AHEAD_MS) {
		// A provider outage keeps the still-valid session; failing the request would turn a blip into an outage.
		const { data: refreshedData, error: refreshError } = await supabase.auth
			.refreshSession()
			.catch((error: unknown) => ({ data: { session: null }, error }));
		if (isStaleSupabaseAuthError(refreshError)) {
			clearSupabaseAuthCookies(cookies, storageKey);
			return { status: 'resolved', session: null, user: null };
		}
		if (refreshedData.session?.access_token) session = refreshedData.session;
	}

	const { data: claimsData, error: claimsError } = await supabase.auth
		.getClaims(session.access_token)
		.catch((error) => {
			if (isStaleSupabaseAuthError(error)) {
				clearSupabaseAuthCookies(cookies, storageKey);
				return { data: null, error };
			}
			throw error;
		});
	if (claimsError || !claimsData?.claims) {
		if (isStaleSupabaseAuthError(claimsError)) {
			clearSupabaseAuthCookies(cookies, storageKey);
		}
		return { status: 'resolved', session: null, user: null };
	}

	const { data: userData, error: userError } = await supabase.auth.getUser().catch((error) => {
		if (isStaleSupabaseAuthError(error)) {
			clearSupabaseAuthCookies(cookies, storageKey);
			return { data: null, error };
		}
		throw error;
	});
	const authenticatedUser = userData?.user ?? null;
	const userMatchesClaims = authenticatedUser?.id === claimsData.claims.sub;
	if (userError || !userMatchesClaims) {
		if (isStaleSupabaseAuthError(userError) || (!userError && !userMatchesClaims)) {
			clearSupabaseAuthCookies(cookies, storageKey);
		}
		return { status: 'resolved', session: null, user: null };
	}
	// Logout owns revocation/retry and must remain reachable during lookup outages.
	if (!isLogout) {
		const lifetime = await readSessionLifetime(supabase, session.access_token);
		if (lifetime === 'unavailable') return { status: 'unavailable', reason: 'lifetime' };
		if (lifetime === 'expired') {
			const revoked = await supabase.auth.admin.signOut(session.access_token, 'global').catch(() => null);
			if (revoked?.error !== null) return { status: 'unavailable', reason: 'revocation' };
			clearSupabaseAuthCookies(cookies, storageKey);
			cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
			return { status: 'resolved', session: null, user: null };
		}
	}

	const user = buildTrustedUserFromClaims(claimsData.claims, authenticatedUser);
	const trustedSession = buildTrustedSession(session, user);
	// Email OTP creates a real provider session. Without an app-issued marker it
	// must not become ordinary access when a pending cookie is removed or expires.
	// Logout retains verified credentials to revoke the provider session globally.
	if (
		!isLogout &&
		!isPasswordAuthenticatedSession(trustedSession, user) &&
		!readAuthSessionMarker(cookies, trustedSession, user)
	) {
		clearSupabaseAuthCookies(cookies, storageKey);
		cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
		return { status: 'resolved', session: null, user: null };
	}

	await userStorage.setItem(`${storageKey}-user`, JSON.stringify({ user: authenticatedUser }));
	return { status: 'resolved', session: trustedSession, user };
}

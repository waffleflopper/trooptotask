import { createServerClient } from '@supabase/ssr';
import { type Handle, error, redirect } from '@sveltejs/kit';
import type { Session, User } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { checkRateLimit } from '$lib/server/rateLimit';
import { auditLog } from '$lib/server/auditLog';
import { getAuthCookieOptions } from '$lib/server/authCookies';
import { buildTrustedUserFromClaims, getSupabaseAuthStorageKey, hasSupabaseAuthCookie } from '$lib/server/authSession';
import { isPublicRoute } from '$lib/server/publicRoutes';
import {
	getAuthenticatedRedirectPath,
	getPendingAuthFlowCookieName,
	isMfaStepUpRequired,
	sanitizePendingAuthFlow,
	shouldRedirectIncompleteAuthSession
} from '$lib/server/mfaGate';
import '$lib/server/env'; // validate env vars on startup

const impeccableLiveDevSources = import.meta.env.DEV ? ' http://localhost:8400 http://127.0.0.1:8400' : '';
const devConnectSources = import.meta.env.DEV
	? ' http://127.0.0.1:54321 http://localhost:8400 http://127.0.0.1:8400'
	: '';

const securityHeaders: Record<string, string> = {
	'Content-Security-Policy': `default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com https://va.vercel-scripts.com${impeccableLiveDevSources}; style-src 'self' 'unsafe-inline'; frame-src https://js.stripe.com; connect-src 'self' https://*.supabase.co https://vitals.vercel-insights.com${devConnectSources}; img-src 'self' data: blob:; font-src 'self'`,
	'X-Frame-Options': 'DENY',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
	'X-DNS-Prefetch-Control': 'off'
};

const SUPABASE_AUTH_STORAGE_KEY = getSupabaseAuthStorageKey(PUBLIC_SUPABASE_URL);
const STALE_SUPABASE_AUTH_ERROR_CODES = new Set([
	'refresh_token_not_found',
	'refresh_token_already_used',
	'session_not_found',
	'session_expired'
]);

function getAuthErrorCode(error: unknown): string | null {
	if (!error || typeof error !== 'object' || !('code' in error)) return null;
	return typeof error.code === 'string' ? error.code : null;
}

function isStaleSupabaseAuthError(error: unknown): boolean {
	const code = getAuthErrorCode(error);
	return Boolean(code && STALE_SUPABASE_AUTH_ERROR_CODES.has(code));
}

function clearSupabaseAuthCookies(event: Parameters<Handle>[0]['event']): void {
	for (const { name } of event.cookies.getAll()) {
		if (hasSupabaseAuthCookie([name], SUPABASE_AUTH_STORAGE_KEY)) {
			event.cookies.delete(name, { path: '/' });
		}
	}
}

type SafeSessionResult = { session: Session | null; user: User | null };

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

export const handle: Handle = async ({ event, resolve }) => {
	// Rate limiting — skip for e2e tests (dev mode only, tree-shaken in production)
	const clientIp = event.getClientAddress();
	if (import.meta.env.DEV && process.env.E2E_TESTING === 'true') {
		// rate limiting skipped for e2e tests
	} else {
		const rateCheck = checkRateLimit(clientIp, event.url.pathname, event.request.method);
		if (rateCheck.limited) {
			auditLog(
				{
					action: 'security.rate_limit_exceeded',
					resourceType: 'request',
					severity: 'warning',
					details: { pathname: event.url.pathname, method: event.request.method }
				},
				{ userId: null, ip: clientIp }
			);
			return new Response(JSON.stringify({ error: 'Too many requests' }), {
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Retry-After': String(Math.ceil(rateCheck.retryAfterMs / 1000))
				}
			});
		}
	}

	const requestUserStorageItems = new Map<string, string>();
	const requestUserStorage = {
		getItem: (key: string) => requestUserStorageItems.get(key) ?? null,
		setItem: (key: string, value: string) => {
			requestUserStorageItems.set(key, value);
		},
		removeItem: (key: string) => {
			requestUserStorageItems.delete(key);
		}
	};

	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		auth: {
			userStorage: requestUserStorage
		},
		cookies: {
			encode: 'tokens-only',
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, getAuthCookieOptions(options));
				});
			}
		}
	});

	// Cache auth verification within a single request to avoid redundant auth API calls.
	let cachedSession: SafeSessionResult | null = null;
	event.locals.safeGetSession = async () => {
		if (cachedSession) return cachedSession;
		const hasAuthCookie = hasSupabaseAuthCookie(
			event.cookies.getAll().map(({ name }) => name),
			SUPABASE_AUTH_STORAGE_KEY
		);

		if (!hasAuthCookie) {
			cachedSession = { session: null, user: null };
			return cachedSession;
		}

		const {
			data: { session },
			error: sessionError
		} = await event.locals.supabase.auth.getSession().catch((error) => {
			if (isStaleSupabaseAuthError(error)) {
				clearSupabaseAuthCookies(event);
				return { data: { session: null }, error };
			}
			throw error;
		});

		if (sessionError || !session?.access_token) {
			if (isStaleSupabaseAuthError(sessionError)) {
				clearSupabaseAuthCookies(event);
			}
			cachedSession = { session: null, user: null };
			return cachedSession;
		}

		const { data: claimsData, error: claimsError } = await event.locals.supabase.auth
			.getClaims(session.access_token)
			.catch((error) => {
				if (isStaleSupabaseAuthError(error)) {
					clearSupabaseAuthCookies(event);
					return { data: null, error };
				}
				throw error;
			});
		if (claimsError || !claimsData?.claims) {
			if (isStaleSupabaseAuthError(claimsError)) {
				clearSupabaseAuthCookies(event);
			}
			cachedSession = { session: null, user: null };
			return cachedSession;
		}

		const { data: userData, error: userError } = await event.locals.supabase.auth.getUser().catch((error) => {
			if (isStaleSupabaseAuthError(error)) {
				clearSupabaseAuthCookies(event);
				return { data: null, error };
			}
			throw error;
		});
		const authenticatedUser = userData?.user ?? null;
		const userMatchesClaims = authenticatedUser?.id === claimsData.claims.sub;
		if (userError || !userMatchesClaims) {
			if (isStaleSupabaseAuthError(userError) || (!userError && !userMatchesClaims)) {
				clearSupabaseAuthCookies(event);
			}
			cachedSession = { session: null, user: null };
			return cachedSession;
		}
		await requestUserStorage.setItem(`${SUPABASE_AUTH_STORAGE_KEY}-user`, JSON.stringify({ user: authenticatedUser }));

		const user = buildTrustedUserFromClaims(claimsData.claims, authenticatedUser);
		cachedSession = { session: buildTrustedSession(session, user), user };
		return cachedSession;
	};
	// Always attempt to get the session — public routes need user info for conditional rendering
	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;
	event.locals.mfaPending = false;
	event.locals.authFlow = sanitizePendingAuthFlow(event.cookies.get(getPendingAuthFlowCookieName()));

	if (session && user?.last_sign_in_at) {
		// Enforce 24-hour absolute session timeout
		const sessionCreated = new Date(user.last_sign_in_at).getTime();
		const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours
		if (Date.now() - sessionCreated > maxSessionAge) {
			await event.locals.supabase.auth.signOut();
			event.cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
			event.locals.session = null;
			event.locals.user = null;
			event.locals.authFlow = null;
		}
	}

	if (!event.locals.session && event.locals.authFlow) {
		event.cookies.delete(getPendingAuthFlowCookieName(), { path: '/' });
		event.locals.authFlow = null;
	}

	if (event.locals.session) {
		const { data: assuranceData, error: assuranceError } =
			await event.locals.supabase.auth.mfa.getAuthenticatorAssuranceLevel();

		if (assuranceError) {
			console.error('Failed to read authenticator assurance level:', assuranceError.message);
		} else {
			event.locals.mfaPending = isMfaStepUpRequired(assuranceData);
		}
	}

	// Protect routes — redirect unauthenticated users to login
	if (!event.locals.session && !isPublicRoute(event.url.pathname)) {
		redirect(303, '/auth/login');
	}

	if (
		shouldRedirectIncompleteAuthSession(
			event.url.pathname,
			!!event.locals.session,
			event.locals.mfaPending,
			event.locals.authFlow
		)
	) {
		redirect(303, getAuthenticatedRedirectPath(event.locals.authFlow, event.locals.mfaPending));
	}

	// Check user suspension (skip for auth routes, api routes, and the suspended page itself)
	const skipSuspensionCheck = ['/auth', '/api/auth', '/suspended'].some((p) => event.url.pathname.startsWith(p));
	if (event.locals.user && !skipSuspensionCheck) {
		const { data: isSuspended, error: suspensionError } = await event.locals.supabase.rpc('is_user_suspended', {
			check_user_id: event.locals.user.id
		});
		if (suspensionError) {
			console.error('Failed to check user suspension status:', suspensionError.message);
			error(500, 'Unable to verify account status');
		}
		if (isSuspended) {
			return new Response(null, {
				status: 302,
				headers: { Location: '/suspended' }
			});
		}
	}

	const response = await resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});

	for (const [header, value] of Object.entries(securityHeaders)) {
		response.headers.set(header, value);
	}

	return response;
};

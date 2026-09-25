import { createServerClient } from '@supabase/ssr';
import { type Handle, error, redirect } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { checkRateLimit } from '$lib/server/rateLimit';
import { auditLog } from '$lib/server/auditLog';
import { getAuthCookieOptions } from '$lib/server/authCookies';
import { readIdentitySession, readIdentityAdmission } from '$features/identity/index.server';
import { requireActiveOrganization } from '$lib/server/adapters/supabaseOrganizationAdmission';
import '$lib/server/env'; // validate env vars on startup

const impeccableLiveDevSources = import.meta.env.DEV ? ' http://localhost:8400 http://127.0.0.1:8400' : '';
const devConnectSources = import.meta.env.DEV
	? ' http://127.0.0.1:54321 http://localhost:8400 http://127.0.0.1:8400'
	: '';

const securityHeaders: Record<string, string> = {
	'Content-Security-Policy': `default-src 'self'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com${impeccableLiveDevSources}; style-src 'self' 'unsafe-inline'; frame-src 'none'; connect-src 'self' https://*.supabase.co https://vitals.vercel-insights.com${devConnectSources}; img-src 'self' data: blob:; font-src 'self'`,
	'X-Frame-Options': 'DENY',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
	'X-DNS-Prefetch-Control': 'off'
};

export const handle: Handle = async ({ event, resolve }) => {
	const clientIp = event.getClientAddress();
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

	event.locals.actor = null;
	event.locals.mfaPending = false;
	event.locals.authFlow = null;
	event.locals.session = null;
	event.locals.user = null;
	// Public routes also need verified identity for conditional rendering.
	const identity = await readIdentitySession({
		supabase: event.locals.supabase,
		cookies: event.cookies,
		supabaseUrl: PUBLIC_SUPABASE_URL,
		isLogout: event.url.pathname === '/auth/logout',
		userStorage: requestUserStorage
	});
	if (identity.status === 'unavailable') {
		error(
			503,
			identity.reason === 'lifetime'
				? 'Unable to verify session lifetime'
				: 'Unable to confirm sign-out. Please try again.'
		);
	}
	const { session, user } = identity;
	event.locals.session = session;
	event.locals.user = user;
	const admission = await readIdentityAdmission({
		supabase: event.locals.supabase,
		session,
		user,
		cookies: event.cookies,
		pathname: event.url.pathname,
		method: event.request.method
	});
	if (admission.status === 'unavailable') error(admission.code, admission.message);
	if (admission.status === 'redirect') {
		if (admission.code === 302) return new Response(null, { status: 302, headers: { Location: admission.location } });
		redirect(303, admission.location);
	}
	event.locals.actor = admission.actor;
	event.locals.mfaPending = admission.mfaPending;
	event.locals.authFlow = admission.authFlow;

	// Layouts do not protect endpoints/actions. Keep page GETs available for the
	// suspended shell, but admit every Organization write/API request on fresh status.
	const orgSegment = event.params?.orgId;
	const isOrganizationApi = event.route?.id?.startsWith('/org/[orgId]/api/');
	const isWriteRequest = !['GET', 'HEAD', 'OPTIONS'].includes(event.request.method);
	if (orgSegment && (isWriteRequest || isOrganizationApi)) {
		await requireActiveOrganization(event.locals.supabase, orgSegment);
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

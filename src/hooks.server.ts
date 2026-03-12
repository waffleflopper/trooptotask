import { createServerClient } from '@supabase/ssr';
import { type Handle, redirect } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { checkRateLimit } from '$lib/server/rateLimit';
import { auditLog } from '$lib/server/auditLog';

const securityHeaders: Record<string, string> = {
	'Content-Security-Policy':
		"default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; style-src 'self' 'unsafe-inline'; frame-src https://js.stripe.com; connect-src 'self' https://*.supabase.co; img-src 'self' data: blob:; font-src 'self'",
	'X-Frame-Options': 'DENY',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
	'X-DNS-Prefetch-Control': 'off'
};

export const handle: Handle = async ({ event, resolve }) => {
	// Rate limiting
	const clientIp = event.getClientAddress();
	const rateCheck = checkRateLimit(clientIp, event.url.pathname, event.request.method);
	if (rateCheck.limited) {
		auditLog(
			{ action: 'security.rate_limit_exceeded', resourceType: 'request', severity: 'warning', details: { pathname: event.url.pathname, method: event.request.method } },
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

	const isProd = event.url.hostname.endsWith('trooptotask.org');

	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, {
						...options,
						path: '/',
						...(isProd && { domain: '.trooptotask.org' })
					});
				});
			}
		}
	});

	// Cache getUser() result within a single request to avoid redundant auth API calls
	let cachedSession: { session: any; user: any } | null = null;
	event.locals.safeGetSession = async () => {
		if (cachedSession) return cachedSession;
		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();

		cachedSession =
			error || !user
				? { session: null, user: null }
				: { session: { user } as any, user };
		return cachedSession;
	};

	// Define public routes that don't require authentication
	const publicRoutes = ['/', '/auth', '/api/webhooks', '/demo', '/api/create-demo-sandbox', '/api/access-requests', '/features', '/pricing', '/security', '/terms', '/privacy', '/dashboard'];
	const isPublicRoute = publicRoutes.some(route =>
		event.url.pathname === route || event.url.pathname.startsWith(route + '/')
	);

	// Check for demo mode - allow unauthenticated access to /org/* routes if in demo mode
	const isDemoMode = event.cookies.get('demo_mode') === 'readonly' || event.cookies.get('demo_sandbox');
	const isOrgRoute = event.url.pathname.startsWith('/org/');

	// Always attempt to get the session — public routes need user info for conditional rendering
	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	if (session && user?.last_sign_in_at) {
		// Enforce 24-hour absolute session timeout
		const sessionCreated = new Date(user.last_sign_in_at).getTime();
		const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours
		if (Date.now() - sessionCreated > maxSessionAge) {
			await event.locals.supabase.auth.signOut();
			event.locals.session = null;
			event.locals.user = null;
		}
	}

	// Protect routes — redirect unauthenticated users to login (skip public routes and demo mode)
	if (!event.locals.session && !isPublicRoute && !(isDemoMode && isOrgRoute)) {
		redirect(303, '/auth/login');
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

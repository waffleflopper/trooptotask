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

	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});

	event.locals.safeGetSession = async () => {
		// Use getUser() to securely verify the user from the auth server
		// This avoids the insecure session warning from getSession()
		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();

		if (error || !user) {
			return { session: null, user: null };
		}

		// Return a minimal session object to indicate authenticated state
		// We don't need the full session since user is verified via getUser()
		return {
			session: { user } as any,
			user
		};
	};

	// Get session for route protection - this also refreshes the session if needed
	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	// Enforce 24-hour absolute session timeout
	if (user && user.last_sign_in_at) {
		const sessionCreated = new Date(user.last_sign_in_at).getTime();
		const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours
		if (Date.now() - sessionCreated > maxSessionAge) {
			await event.locals.supabase.auth.signOut();
			event.locals.session = null;
			event.locals.user = null;
		}
	}

	// Define public routes that don't require authentication
	const publicRoutes = ['/', '/auth', '/api/webhooks', '/demo', '/api/create-demo-sandbox', '/api/access-requests', '/features', '/pricing'];
	const isPublicRoute = publicRoutes.some(route =>
		event.url.pathname === route || event.url.pathname.startsWith(route + '/')
	);

	// Check for demo mode - allow unauthenticated access to /org/* routes if in demo mode
	const isDemoMode = event.cookies.get('demo_mode') === 'readonly' || event.cookies.get('demo_sandbox');
	const isOrgRoute = event.url.pathname.startsWith('/org/');

	// Protect routes - redirect unauthenticated users to login
	// Exception: allow demo mode access to org routes
	if (!session && !isPublicRoute && !(isDemoMode && isOrgRoute)) {
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

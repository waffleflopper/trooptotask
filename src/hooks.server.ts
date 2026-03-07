import { createServerClient } from '@supabase/ssr';
import { type Handle, redirect } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const handle: Handle = async ({ event, resolve }) => {
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

	// Define public routes that don't require authentication
	const publicRoutes = ['/', '/auth', '/api/webhooks', '/demo', '/api/create-demo-sandbox', '/api/access-requests', '/features'];
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

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};

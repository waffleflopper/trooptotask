import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

/**
 * Returns a Supabase admin client with service role access.
 * Use this for admin operations that need to bypass RLS or access auth.users.
 */
export function getAdminClient(): SupabaseClient {
	return createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || '', {
		auth: { persistSession: false }
	});
}

/**
 * Returns a Supabase client appropriate for the current context.
 * Uses service role client for demo mode to bypass RLS.
 */
export function getSupabaseClient(locals: App.Locals, cookies: Cookies): SupabaseClient {
	const demoMode = cookies.get('demo_mode');
	const demoSandbox = cookies.get('demo_sandbox');
	const isDemoMode = demoMode === 'readonly' || !!demoSandbox;

	if (isDemoMode) {
		return createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || '', {
			auth: { persistSession: false }
		});
	}

	return locals.supabase;
}

/**
 * Info about the current demo sandbox session
 */
export interface SandboxInfo {
	orgId: string;
	sessionId: string;
}

/**
 * Checks if the request is from a valid demo sandbox session.
 * Returns sandbox info if valid, null otherwise.
 */
export function getSandboxInfo(cookies: Cookies): SandboxInfo | null {
	const demoSandbox = cookies.get('demo_sandbox');
	if (!demoSandbox) return null;

	try {
		const info = JSON.parse(demoSandbox);
		if (info.orgId && info.sessionId) {
			return info as SandboxInfo;
		}
	} catch {
		// Invalid cookie
	}
	return null;
}

/**
 * Gets authentication context for API routes.
 * Handles both regular users and demo sandbox users.
 * Throws 401 if neither authenticated user nor valid sandbox.
 */
export function getApiContext(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string
): { supabase: SupabaseClient; userId: string | null; isSandbox: boolean } {
	const sandboxInfo = getSandboxInfo(cookies);

	// Check if this is a valid sandbox request
	if (sandboxInfo && sandboxInfo.orgId === orgId) {
		return {
			supabase: createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || '', {
				auth: { persistSession: false }
			}),
			userId: null,
			isSandbox: true
		};
	}

	// Regular authenticated user
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	return {
		supabase: locals.supabase,
		userId: locals.user.id,
		isSandbox: false
	};
}

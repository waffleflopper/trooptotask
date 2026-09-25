import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

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
 */
export function getSupabaseClient(locals: App.Locals, _cookies?: Cookies): SupabaseClient {
	return locals.supabase;
}

import { createClient } from '@supabase/supabase-js';
import type { Database, SupabaseClient } from '$lib/server/database';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';

/**
 * Use this for admin operations that need to bypass RLS or access auth.users.
 */
export function getAdminClient(): SupabaseClient {
	return createClient<Database>(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || '', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
}

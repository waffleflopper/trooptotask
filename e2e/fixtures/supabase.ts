import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// dotenv/config loads .env.local before module-level code runs
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!serviceRoleKey) {
	throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for e2e tests. Check .env.local');
}

export const adminClient = createClient(supabaseUrl, serviceRoleKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false
	}
});

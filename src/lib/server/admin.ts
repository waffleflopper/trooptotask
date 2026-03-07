import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminRole = 'super_admin' | 'support' | 'billing';

export async function isPlatformAdmin(
	supabase: SupabaseClient,
	userId: string
): Promise<boolean> {
	// Use the database function which is SECURITY DEFINER and bypasses RLS
	const { data, error: err } = await supabase.rpc('is_platform_admin');

	if (err) {
		console.error('Error checking platform admin status:', err);
		return false;
	}

	return data === true;
}

export async function getAdminRole(
	supabase: SupabaseClient,
	userId: string
): Promise<AdminRole | null> {
	const { data, error: err } = await supabase
		.from('platform_admins')
		.select('role')
		.eq('user_id', userId)
		.eq('is_active', true)
		.single();

	if (err || !data) {
		return null;
	}

	return data.role as AdminRole;
}

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Retained as a compatibility hook for ports that invalidate billing reads after writes.
 * The former RPC-backed tier cache has been retired; current reads use app-owned plan policy modules.
 */
export function invalidateTierCache(orgId: string): void {
	void orgId;
}

/**
 * Count bulk data exports this month for an org.
 */
export async function getMonthlyExportCount(supabase: SupabaseClient, orgId: string): Promise<number> {
	const now = new Date();
	const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

	const { count, error } = await supabase
		.from('data_exports')
		.select('*', { count: 'exact', head: true })
		.eq('org_id', orgId)
		.gte('created_at', startOfMonth.toISOString());
	if (error) throw error;
	return count ?? 0;
}

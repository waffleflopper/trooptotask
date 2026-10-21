import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationUnitCountsPort } from './unitCounts.server';

/** The ordinary request client keeps these counts under row-level security. */
export function createSupabaseOrganizationUnitCountsPort(
	supabase: SupabaseClient,
	orgId: string,
	ratingScheme: { countEntries(): Promise<number> }
): OrganizationUnitCountsPort {
	return {
		async countRows({ table, archived }) {
			let query = supabase.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', orgId);
			if (archived === false) query = query.is('archived_at', null);
			if (archived === true) query = query.not('archived_at', 'is', null);
			const { count, error } = await query;
			if (error) throw new Error(error.message);
			return count ?? 0;
		},
		countRatingSchemeEntries: () => ratingScheme.countEntries()
	};
}

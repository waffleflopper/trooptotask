import type { SupabaseClient } from '@supabase/supabase-js';
import type { RatingSchemePersonnelLookupPort, RatingSchemePersonnelLookupRecord } from '$lib/server/core/ports';

interface RatingSchemePersonnelLookupRow {
	id: string;
	rank: string | null;
	last_name: string | null;
	first_name: string | null;
}

export function createSupabaseRatingSchemePersonnelLookupPort(
	supabase: SupabaseClient
): RatingSchemePersonnelLookupPort {
	return {
		async listPersonnelLookup(orgId: string): Promise<RatingSchemePersonnelLookupRecord[]> {
			const { data, error } = await supabase.rpc('list_rating_scheme_personnel_lookup', {
				p_organization_id: orgId
			});

			if (error) {
				throw new Error(error.message);
			}

			return ((data ?? []) as RatingSchemePersonnelLookupRow[]).map((row) => ({
				id: row.id,
				rank: row.rank ?? '',
				lastName: row.last_name ?? '',
				firstName: row.first_name ?? ''
			}));
		}
	};
}

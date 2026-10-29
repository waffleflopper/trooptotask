import type { SupabaseClient } from '$lib/server/database';
import type { OrganizationUnitCountsPort } from './unitCounts.server';

export function createSupabaseOrganizationUnitCountsPort(
	getClient: () => SupabaseClient,
	orgId: string,
	ratingScheme: { countEntries(): Promise<number> }
): OrganizationUnitCountsPort {
	return {
		async countRows({ table, archived }) {
			let query = getClient().from(table).select('id', { count: 'exact', head: true }).eq('organization_id', orgId);
			if (archived === false) query = query.is('archived_at', null);
			if (archived === true) query = query.not('archived_at', 'is', null);
			const { count, error } = await query;
			if (error) throw new Error(error.message);
			return count ?? 0;
		},
		countRatingSchemeEntries: () => ratingScheme.countEntries()
	};
}

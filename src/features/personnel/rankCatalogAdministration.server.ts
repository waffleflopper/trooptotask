import type { SupabaseClient } from '$lib/server/database';
import { getAdminClient } from '$lib/server/supabase';
import type { RankCatalogAdministrationPort } from './rankCatalogOperations.server';
import { fail } from '$lib/errors';

export function createSupabaseRankCatalogAdministrationPort(
	deps: { getAdminClient?: () => SupabaseClient } = {}
): RankCatalogAdministrationPort {
	const getAdminClientFn = deps.getAdminClient ?? getAdminClient;

	return {
		async deleteRankCatalogEntry(orgId, entryId, code) {
			const { error } = await getAdminClientFn().rpc('delete_unused_organization_rank_catalog_entry', {
				p_organization_id: orgId,
				p_entry_id: entryId,
				p_code: code
			});

			if (error) {
				if (error.code === '23503' && error.message === 'Rank is referenced by Organization data. Retire it instead.') {
					fail(409, 'Rank is referenced by Organization data. Retire it instead.');
				}
				throw new Error(error.message);
			}
		}
	};
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminClient } from '$lib/server/supabase';
import type { RankCatalogAdministrationPort } from '$lib/server/core/useCases/rankCatalog';
import { fail } from '$lib/server/core/errors';

export function createSupabaseRankCatalogAdministrationPort(
	_locals: Pick<App.Locals, 'supabase'>,
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

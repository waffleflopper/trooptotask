import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminClient } from '$lib/server/supabase';
import type { RankCatalogAdministrationPort } from '$lib/server/core/useCases/rankCatalog';

export function createSupabaseRankCatalogAdministrationPort(
	_locals: Pick<App.Locals, 'supabase'>,
	deps: { getAdminClient?: () => SupabaseClient } = {}
): RankCatalogAdministrationPort {
	const getAdminClientFn = deps.getAdminClient ?? getAdminClient;

	return {
		async deleteRankCatalogEntry(orgId, entryId) {
			const { data, error } = await getAdminClientFn()
				.from('organization_rank_catalog')
				.delete()
				.eq('organization_id', orgId)
				.eq('id', entryId)
				.select('id');

			if (error) {
				throw new Error(error.message);
			}
			if (data?.length !== 1) {
				throw new Error('Rank catalog entry could not be removed');
			}
		}
	};
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDefaultRankCatalogSeeds } from './rankCatalogOperations.server';

/** Seed built-in Personnel ranks after Organization's owner-creation RPC. */
export async function seedDefaultRankCatalog(supabase: SupabaseClient, organizationId: string): Promise<string | null> {
	const { error } = await supabase.from('organization_rank_catalog').upsert(
		buildDefaultRankCatalogSeeds().map((entry) => ({ ...entry, organization_id: organizationId })),
		{
			onConflict: 'organization_id,code',
			ignoreDuplicates: true
		}
	);
	return error?.message ?? null;
}

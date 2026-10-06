import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { evaluateFeaturePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { RatingSchemeDueActor, RatingSchemePersistence } from '../contracts';

export interface RatingSchemeExportReader {
	listRows(): Promise<Record<string, unknown>[]>;
}

export function createSupabaseRatingSchemeExportReader(
	client: SupabaseClient,
	orgId: string
): RatingSchemeExportReader {
	return {
		async listRows() {
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				const { data, error } = await client
					.from('rating_scheme_entries')
					.select('*')
					.eq('organization_id', orgId)
					.order('id', { ascending: true })
					.range(from, to);
				return { data, error };
			});
			if (result.error)
				throw new Error((result.error as { message?: string }).message ?? 'Rating Scheme export read failed');
			return result.data ?? [];
		}
	};
}

/** Optional getting-started count: a denied or empty Rating lane contributes zero. */
export async function countRatingSchemeEntries({
	ratingScheme,
	actor
}: {
	ratingScheme: Pick<RatingSchemePersistence, 'countEntries'>;
	actor: RatingSchemeDueActor;
}): Promise<number> {
	const decision = await evaluateFeaturePolicy({ auth: actor }, POLICY_ACTION_CATALOG.ratingScheme.viewEntries, {
		kind: 'unscoped'
	});
	if (!decision.allowed || (actor.scopeSet.kind === 'groups' && actor.scopeSet.groupIds.length === 0)) return 0;
	return ratingScheme.countEntries();
}

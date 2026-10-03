import { evaluateFeaturePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { RatingSchemeReadStore } from './ratingSchemeReadPorts.server';
import type { RatingSchemeDueActor } from '../contracts';

/** Raw saved rows for the separately authorized Organization export, retaining request-client RLS. */
export function listRatingSchemeExportRows(
	store: Pick<RatingSchemeReadStore, 'findMany'>,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('rating_scheme_entries', orgId, undefined, {
		orderBy: [{ column: 'id', ascending: true }]
	});
}

/** Optional getting-started count: a denied or empty Rating lane contributes zero. */
export async function countRatingSchemeEntries({
	store,
	actor
}: {
	store: Pick<RatingSchemeReadStore, 'findManyWithCount'>;
	actor: RatingSchemeDueActor;
}): Promise<number> {
	const decision = await evaluateFeaturePolicy({ auth: actor }, POLICY_ACTION_CATALOG.ratingScheme.viewEntries, {
		kind: 'unscoped'
	});
	if (!decision.allowed || (actor.scopeSet.kind === 'groups' && actor.scopeSet.groupIds.length === 0)) return 0;
	const result = await store.findManyWithCount<{ id: string }>('rating_scheme_entries', actor.orgId, undefined, {
		select: 'id',
		range: { from: 0, to: 0 },
		count: 'estimated'
	});
	return result.count ?? 0;
}

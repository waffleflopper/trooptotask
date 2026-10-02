import { requireFeaturePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PersonnelRatingSchemeRosterPort } from '$features/personnel/contracts';
import type { RatingSchemeWorkspaceData } from '../contracts';
import { RatingSchemeEntryEntity } from './ratingSchemeEntryEntity.server';
import type { RatingSchemeReadStore } from './ratingSchemeReadPorts.server';

type PolicyContext = Parameters<typeof requireFeaturePolicy>[0];
interface RatingSchemeWorkspaceContext extends PolicyContext {
	readonly rawStore: Pick<RatingSchemeReadStore, 'findMany'>;
	readonly personnelRatingSchemeRoster?: Pick<PersonnelRatingSchemeRosterPort, 'listActiveReferences'>;
}

/** Load the complete authorized workspace independently of Personnel's view capability. */
export async function loadRatingSchemeWorkspace(ctx: RatingSchemeWorkspaceContext): Promise<RatingSchemeWorkspaceData> {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.ratingScheme.readRosterReferences,
		{ kind: 'unscoped' },
		'rating-scheme'
	);
	if (!ctx.personnelRatingSchemeRoster) throw new Error('Personnel Rating Scheme roster port is required');

	const [personnelLookup, rows] = await Promise.all([
		ctx.personnelRatingSchemeRoster.listActiveReferences(ctx.auth),
		// Authenticated Rating RLS owns row scope. The generic scoped store requires Personnel SELECT.
		ctx.rawStore.findMany<Record<string, unknown>>(RatingSchemeEntryEntity.table, ctx.auth.orgId, undefined, {
			select: RatingSchemeEntryEntity.select,
			orderBy: [
				{ column: 'rating_period_end', ascending: true },
				{ column: 'id', ascending: true }
			]
		})
	]);
	return {
		personnelLookup,
		ratingSchemeEntries: RatingSchemeEntryEntity.fromDbArray(rows)
	};
}

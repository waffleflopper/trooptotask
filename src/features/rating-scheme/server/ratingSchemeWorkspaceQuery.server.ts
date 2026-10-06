import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PersonnelRatingSchemeRosterPort } from '$features/personnel/contracts';
import type { RatingSchemePersistence, RatingSchemeWorkspaceData } from '../contracts';

interface RatingSchemeWorkspaceContext {
	auth: OrganizationAccessGrant;
	audit?: PolicyAuditSink;
	readonly ratingScheme: Pick<RatingSchemePersistence, 'listWorkspace'>;
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

	const [personnelLookup, ratingSchemeEntries] = await Promise.all([
		ctx.personnelRatingSchemeRoster.listActiveReferences(ctx.auth),
		ctx.ratingScheme.listWorkspace()
	]);
	return {
		personnelLookup,
		ratingSchemeEntries
	};
}

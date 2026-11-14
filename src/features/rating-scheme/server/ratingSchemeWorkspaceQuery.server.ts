import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PersonnelRatingSchemeRosterPort } from '$features/personnel/contracts';
import { isArchivedPerson, toArchivedPersonIds } from '../archivedPeople';
import type { RatingSchemeEntryEditorData, RatingSchemePersistence, RatingSchemeWorkspaceData } from '../contracts';

interface RatingSchemeWorkspaceContext {
	auth: OrganizationAccessGrant;
	audit?: PolicyAuditSink;
	readonly ratingScheme: Pick<RatingSchemePersistence, 'listRatingSchemes' | 'listEvaluations'>;
	readonly personnelRatingSchemeRoster?: Pick<
		PersonnelRatingSchemeRosterPort,
		'listActiveReferences' | 'listArchivedRatedPersonIds'
	>;
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

	const [personnelLookup, archivedIds, ratingSchemes, evaluations] = await Promise.all([
		ctx.personnelRatingSchemeRoster.listActiveReferences(ctx.auth),
		ctx.personnelRatingSchemeRoster.listArchivedRatedPersonIds(ctx.auth),
		ctx.ratingScheme.listRatingSchemes(),
		ctx.ratingScheme.listEvaluations()
	]);
	const archived = toArchivedPersonIds(archivedIds);
	const isListedPerson = (row: { ratedPersonId: string }) => !isArchivedPerson(archived, row.ratedPersonId);
	return {
		personnelLookup,
		ratingSchemes: ratingSchemes.filter(isListedPerson),
		evaluations: evaluations.filter(isListedPerson)
	};
}

/** One Evaluation and its scheme for an editor opened outside the Evals page; null when missing or its rated Person is archived. */
export async function loadRatingSchemeEntryEditor(
	ctx: RatingSchemeWorkspaceContext,
	evaluationId: string
): Promise<RatingSchemeEntryEditorData | null> {
	const { personnelLookup, ratingSchemes, evaluations } = await loadRatingSchemeWorkspace(ctx);
	const evaluation = evaluations.find((candidate) => candidate.id === evaluationId);
	const ratingScheme = evaluation && ratingSchemes.find((candidate) => candidate.id === evaluation.ratingSchemeId);
	return evaluation && ratingScheme ? { ratingScheme, evaluation, personnelLookup } : null;
}

/**
 * Create, update and delete OER/NCOER/WOER evaluation records.
 * The rated Person anchors Group access; internal evaluators stay Organization-local.
 *
 * Empty string fields are coerced to null before persistence (optional fields pattern).
 */
import { POLICY_ACTION_CATALOG, type FeatureLanePolicyAction, type PolicyResource } from '$lib/access/policyEvaluator';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { PersonnelRatingSchemeRosterPort, PersonnelWriteSubject } from '$features/personnel/contracts';
import type {
	RatingSchemePersistence,
	RatingSchemePatchValues,
	RatingSchemeWriteReference,
	SavedRatingSchemeEntry
} from '../contracts';
import { ratingSchemeEntryCreateSchema, ratingSchemeEntryUpdateSchema } from './ratingSchemeEntryMapping.server';
import { validateUUID } from '$lib/server/validation';
import { policyResourceForGroup, requireFeaturePolicy, requireGovernancePolicy } from '$lib/access/index.server';
import { RequestFailure } from '$lib/errors';

export { ratingSchemeEntryCreateSchema, ratingSchemeEntryUpdateSchema } from './ratingSchemeEntryMapping.server';

export interface RatingSchemeEntryWriteContext {
	readonly auth: OrganizationAccessGrant;
	readonly audit: PolicyAuditSink;
	readonly ratingScheme: Pick<RatingSchemePersistence, 'findWriteReference' | 'create' | 'update' | 'delete'>;
	readonly personnelRatingSchemeRoster?: Pick<
		PersonnelRatingSchemeRosterPort,
		'findRatedPersonForWrite' | 'hasEvaluatorReferences'
	>;
}

export interface RatingSchemeEntryDeleteContext extends RatingSchemeEntryWriteContext {
	readonly notifyRatingSchemeEntryDeleted: () => Promise<void>;
}

const AUDIT_RESOURCE = 'rating_scheme';
const evaluatorFields = [
	'raterPersonId',
	'seniorRaterPersonId',
	'intermediateRaterPersonId',
	'reviewerPersonId'
] as const;

async function ratedPersonForWrite(
	ctx: RatingSchemeEntryWriteContext,
	personnelId: string,
	denialAction: FeatureLanePolicyAction
): Promise<PersonnelWriteSubject> {
	if (!ctx.personnelRatingSchemeRoster) throw new Error('Personnel Rating Scheme roster provider unavailable');
	const person = await ctx.personnelRatingSchemeRoster.findRatedPersonForWrite(ctx.auth, personnelId);
	if (!person) {
		// The provider hides missing and out-of-scope People alike. Group members
		// receive the usual policy denial; Organization-wide members get a 404.
		await requireFeaturePolicy(ctx, denialAction, { kind: 'organization' }, AUDIT_RESOURCE, personnelId);
		throw new RequestFailure(404, 'Rated person not found');
	}
	return person;
}

async function policyResourceForRatedPerson(
	ctx: RatingSchemeEntryWriteContext,
	personnelId: string | null | undefined,
	denialAction: FeatureLanePolicyAction = POLICY_ACTION_CATALOG.ratingScheme.updateEntries
): Promise<PolicyResource> {
	if (!personnelId) {
		return { kind: 'unscoped' };
	}
	return policyResourceForGroup((await ratedPersonForWrite(ctx, personnelId, denialAction)).groupId);
}

async function findRatingSchemeEntry(
	ctx: RatingSchemeEntryWriteContext,
	id: string
): Promise<RatingSchemeWriteReference> {
	const entry = await ctx.ratingScheme.findWriteReference(id);
	if (!entry) throw new RequestFailure(404, 'Rating Scheme entry not found');
	return entry;
}

async function requireEvaluatorReferences(
	ctx: RatingSchemeEntryWriteContext,
	patch: RatingSchemePatchValues,
	current?: RatingSchemeWriteReference
): Promise<void> {
	const ids = evaluatorFields.flatMap((field) => {
		const id = patch[field];
		// NOT VALID database constraints preserve historical links. Unrelated edits
		// must also allow the UI to resubmit an unchanged historical evaluator ID.
		return typeof id === 'string' && id !== '' && id.toLowerCase() !== current?.[field]?.toLowerCase() ? [id] : [];
	});
	if (!ids.length) return;
	if (!ids.every(validateUUID)) {
		throw new RequestFailure(400, 'Evaluators must belong to this Organization');
	}
	if (!ctx.personnelRatingSchemeRoster) throw new Error('Personnel Rating Scheme roster provider unavailable');
	if (!(await ctx.personnelRatingSchemeRoster.hasEvaluatorReferences(ctx.auth, ids))) {
		throw new RequestFailure(400, 'Evaluators must belong to this Organization');
	}
}

async function requireRatingSchemeUpdatePolicy(
	ctx: RatingSchemeEntryWriteContext,
	resource: PolicyResource,
	resourceId?: string
): Promise<void> {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.ratingScheme.updateEntries,
		resource,
		AUDIT_RESOURCE,
		resourceId
	);
}

async function requireRatingSchemeEntryDeletionRequestPolicy(
	ctx: RatingSchemeEntryWriteContext,
	id: string
): Promise<void> {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.ratingScheme.requestEntryDeletion,
		await policyResourceForRatedPerson(
			ctx,
			(await findRatingSchemeEntry(ctx, id)).ratedPersonId,
			POLICY_ACTION_CATALOG.ratingScheme.requestEntryDeletion
		),
		AUDIT_RESOURCE,
		id
	);
}

export async function createRatingSchemeEntry(
	ctx: RatingSchemeEntryWriteContext,
	data: Record<string, unknown>
): Promise<SavedRatingSchemeEntry> {
	const validated = ratingSchemeEntryCreateSchema.parse(data);
	await requireRatingSchemeUpdatePolicy(ctx, await policyResourceForRatedPerson(ctx, validated.ratedPersonId));

	await requireEvaluatorReferences(ctx, validated);
	const entry = await ctx.ratingScheme.create(validated);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.created`,
		resourceType: AUDIT_RESOURCE,
		resourceId: entry.id
	});

	return entry;
}

export async function updateRatingSchemeEntry(
	ctx: RatingSchemeEntryWriteContext,
	data: Record<string, unknown>
): Promise<SavedRatingSchemeEntry> {
	const { id, ...validated } = ratingSchemeEntryUpdateSchema.parse(data);

	const current = await findRatingSchemeEntry(ctx, id);
	await requireRatingSchemeUpdatePolicy(ctx, await policyResourceForRatedPerson(ctx, current.ratedPersonId), id);
	if (validated.ratedPersonId !== undefined) {
		await requireRatingSchemeUpdatePolicy(ctx, await policyResourceForRatedPerson(ctx, validated.ratedPersonId), id);
	}

	await requireEvaluatorReferences(ctx, validated, current);
	const entry = await ctx.ratingScheme.update(id, validated);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.updated`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id
	});

	return entry;
}

export async function removeRatingSchemeEntry(
	ctx: RatingSchemeEntryDeleteContext,
	id: string
): Promise<{ requiresApproval: true } | void> {
	await requireRatingSchemeEntryDeletionRequestPolicy(ctx, id);

	if (!ctx.auth.isPrivileged) {
		return { requiresApproval: true };
	}

	await requireGovernancePolicy(ctx, POLICY_ACTION_CATALOG.organization.deleteRatingSchemeEntry);

	await ctx.ratingScheme.delete(id);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.deleted`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id
	});

	await ctx.notifyRatingSchemeEntryDeleted();
}

/** Describes a deletion request from the entry the requester may ask to remove. */
export async function describeRatingSchemeEntryDeletionRequest(
	ctx: RatingSchemeEntryWriteContext,
	id: string
): Promise<{ description: string; url: string }> {
	const action = POLICY_ACTION_CATALOG.ratingScheme.requestEntryDeletion;
	const { ratedPersonId } = await findRatingSchemeEntry(ctx, id);
	const person = ratedPersonId ? await ratedPersonForWrite(ctx, ratedPersonId, action) : null;
	await requireFeaturePolicy(
		ctx,
		action,
		person ? policyResourceForGroup(person.groupId) : { kind: 'unscoped' },
		AUDIT_RESOURCE,
		id
	);
	return {
		description: person ? `Rating scheme entry for ${person.rank} ${person.lastName}` : 'Rating scheme entry',
		url: `/org/${ctx.auth.orgId}/evals`
	};
}

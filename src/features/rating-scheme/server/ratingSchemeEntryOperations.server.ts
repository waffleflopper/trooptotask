/**
 * The rated Person anchors Group access; internal evaluators stay Organization-local.
 *
 * Empty string fields are coerced to null before persistence (optional fields pattern).
 */
import type { z } from 'zod';
import { POLICY_ACTION_CATALOG, type FeatureLanePolicyAction, type PolicyResource } from '$lib/access/policyEvaluator';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { PersonnelRatingSchemeRosterPort, PersonnelWriteSubject } from '$features/personnel/contracts';
import type {
	RatingSchemePersistence,
	RatingSchemePatchValues,
	RatingSchemeRaterChangeResult,
	RatingSchemeTransition,
	RatingSchemeWriteReference,
	SavedRatingSchemeEntry
} from '../contracts';
import {
	ratingSchemeEntryCreateSchema,
	ratingSchemeEntryUpdateSchema,
	ratingSchemeRaterChangeSchema,
	ratingSchemeTransitionSchema
} from './ratingSchemeEntryMapping.server';
import { validateUUID } from '$lib/server/validation';
import { policyResourceForGroup, requireFeaturePolicy, requireGovernancePolicy } from '$lib/access/index.server';
import { RequestFailure } from '$lib/errors';
import { issueMessage } from '$lib/utils/inputSchemas';

export { ratingSchemeEntryCreateSchema, ratingSchemeEntryUpdateSchema } from './ratingSchemeEntryMapping.server';

export interface RatingSchemeEntryWriteContext {
	readonly auth: OrganizationAccessGrant;
	readonly audit: PolicyAuditSink;
	readonly ratingScheme: Pick<
		RatingSchemePersistence,
		'findWriteReference' | 'create' | 'update' | 'delete' | 'transition' | 'changeRater'
	>;
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

function parseEntryInput<T>(schema: z.ZodType<T>, data: Record<string, unknown>): T {
	const result = schema.safeParse(data);
	if (!result.success) throw new RequestFailure(400, issueMessage(result.error));
	return result.data;
}

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
	personnelId: string,
	denialAction: FeatureLanePolicyAction = POLICY_ACTION_CATALOG.ratingScheme.updateEntries
): Promise<PolicyResource> {
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
	const validated = parseEntryInput(ratingSchemeEntryCreateSchema, data);
	await requireRatingSchemeUpdatePolicy(ctx, await policyResourceForRatedPerson(ctx, validated.ratedPersonId));

	await requireEvaluatorReferences(ctx, validated);
	const entry = await ctx.ratingScheme.create(validated);

	return entry;
}

export async function updateRatingSchemeEntry(
	ctx: RatingSchemeEntryWriteContext,
	data: Record<string, unknown>
): Promise<SavedRatingSchemeEntry> {
	const { id, ...validated } = parseEntryInput(ratingSchemeEntryUpdateSchema, data);

	const current = await findRatingSchemeEntry(ctx, id);
	await requireRatingSchemeUpdatePolicy(ctx, await policyResourceForRatedPerson(ctx, current.ratedPersonId), id);
	if (validated.ratedPersonId !== undefined) {
		await requireRatingSchemeUpdatePolicy(ctx, await policyResourceForRatedPerson(ctx, validated.ratedPersonId), id);
	}

	await requireEvaluatorReferences(ctx, validated, current);
	const entry = await ctx.ratingScheme.update(id, validated);
	if (!entry) throw new RequestFailure(404, 'Rating Scheme entry not found');

	return entry;
}

async function requireEntryUpdatePolicy(
	ctx: RatingSchemeEntryWriteContext,
	id: string
): Promise<RatingSchemeWriteReference> {
	if (!validateUUID(id)) throw new RequestFailure(404, 'Rating Scheme entry not found');
	const current = await findRatingSchemeEntry(ctx, id);
	await requireRatingSchemeUpdatePolicy(ctx, await policyResourceForRatedPerson(ctx, current.ratedPersonId), id);
	return current;
}

/** Moves an evaluation one step; the database refuses any other move. */
export async function transitionRatingSchemeEntry(
	ctx: RatingSchemeEntryWriteContext,
	id: string,
	data: Record<string, unknown>
): Promise<RatingSchemeTransition> {
	const { to } = parseEntryInput(ratingSchemeTransitionSchema, data);
	await requireEntryUpdatePolicy(ctx, id);
	return ctx.ratingScheme.transition(id, to);
}

/** Completes the evaluation as a Change of Rater report and opens the next one for the new rater. */
export async function changeRatingSchemeRater(
	ctx: RatingSchemeEntryWriteContext,
	id: string,
	data: Record<string, unknown>
): Promise<RatingSchemeRaterChangeResult> {
	const change = parseEntryInput(ratingSchemeRaterChangeSchema, data);
	const current = await requireEntryUpdatePolicy(ctx, id);
	await requireEvaluatorReferences(ctx, { raterPersonId: change.raterPersonId }, current);
	return ctx.ratingScheme.changeRater(id, change);
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

	await ctx.notifyRatingSchemeEntryDeleted();
}

/** Describes a deletion request from the entry the requester may ask to remove. */
export async function describeRatingSchemeEntryDeletionRequest(
	ctx: RatingSchemeEntryWriteContext,
	id: string
): Promise<{ description: string; url: string }> {
	const action = POLICY_ACTION_CATALOG.ratingScheme.requestEntryDeletion;
	const { ratedPersonId } = await findRatingSchemeEntry(ctx, id);
	const person = await ratedPersonForWrite(ctx, ratedPersonId, action);
	await requireFeaturePolicy(ctx, action, policyResourceForGroup(person.groupId), AUDIT_RESOURCE, id);
	return {
		description: `Rating scheme entry for ${person.rank} ${person.lastName}`,
		url: `/org/${ctx.auth.orgId}/evals`
	};
}

/**
 * Create, update and delete OER/NCOER/WOER evaluation records.
 * The rated Person anchors Group access; internal evaluators stay Organization-local.
 *
 * Empty string fields are coerced to null before persistence (optional fields pattern).
 */
import { POLICY_ACTION_CATALOG, type FeatureLanePolicyAction, type PolicyResource } from '$lib/access/policyEvaluator';
import { RatingSchemeEntryEntity } from './ratingSchemeEntryEntity.server';
import type { RatingSchemeEntryWriteContext, RatingSchemeEntryDeleteContext } from './ratingSchemeEntryPorts.server';
import type { RatingSchemeEntry } from '../rating-scheme.types';
import { validateUUID } from '$lib/server/validation';
import { policyResourceForGroup, requireFeaturePolicy, requireGovernancePolicy } from '$lib/access/index.server';

const entity = RatingSchemeEntryEntity;
export const ratingSchemeEntryCreateSchema = entity.createSchema;
export const ratingSchemeEntryUpdateSchema = entity.updateSchema;
const AUDIT_RESOURCE = 'rating_scheme';
const evaluatorColumns = [
	'rater_person_id',
	'senior_rater_person_id',
	'intermediate_rater_person_id',
	'reviewer_person_id'
] as const;
type RatingSchemePolicyEntry = { rated_person_id: string | null } & Record<
	(typeof evaluatorColumns)[number],
	string | null
>;

/** Coerce empty strings to null for optional fields */
function coerceEmptyStrings(data: Record<string, unknown>): Record<string, unknown> {
	const result = { ...data };
	for (const key of Object.keys(result)) {
		if (result[key] === '') result[key] = null;
	}
	return result;
}

function optionalPersonnelId(value: unknown): string | null | undefined {
	if (typeof value === 'string' || value === null || value === undefined) {
		return value;
	}

	throw new TypeError('Expected rating scheme personnel id to be a string, null, or undefined');
}

async function policyResourceForRatedPerson(
	ctx: RatingSchemeEntryWriteContext,
	personnelId: string | null | undefined,
	denialAction: FeatureLanePolicyAction = POLICY_ACTION_CATALOG.ratingScheme.updateEntries
): Promise<PolicyResource> {
	if (!personnelId) {
		return { kind: 'unscoped' };
	}

	if (!ctx.personnelRatingSchemeRoster) throw new Error('Personnel Rating Scheme roster provider unavailable');
	const person = await ctx.personnelRatingSchemeRoster.findRatedPersonGroupForWrite(ctx.auth, personnelId);
	if (!person) {
		// The provider hides missing and out-of-scope People alike. Group members
		// receive the usual policy denial; Organization-wide members get a 404.
		await requireFeaturePolicy(ctx, denialAction, { kind: 'organization' }, AUDIT_RESOURCE, personnelId);
		throw Object.assign(new Error('Rated person not found'), { status: 404 });
	}

	return policyResourceForGroup(person.groupId);
}

async function findRatingSchemeEntry(ctx: RatingSchemeEntryWriteContext, id: string): Promise<RatingSchemePolicyEntry> {
	const entry = await (ctx.rawStore ?? ctx.store).findOne<RatingSchemePolicyEntry>(entity.table, ctx.auth.orgId, {
		id
	});
	if (!entry) throw Object.assign(new Error('Rating Scheme entry not found'), { status: 404 });
	return entry;
}

async function requireEvaluatorReferences(
	ctx: RatingSchemeEntryWriteContext,
	patch: Record<string, unknown>,
	current?: RatingSchemePolicyEntry
): Promise<void> {
	const ids = evaluatorColumns.flatMap((column) => {
		const id = patch[column];
		// NOT VALID database constraints preserve historical links. Unrelated edits
		// must also allow the UI to resubmit an unchanged historical evaluator ID.
		return typeof id === 'string' && id.toLowerCase() !== current?.[column]?.toLowerCase() ? [id] : [];
	});
	if (!ids.length) return;
	if (!ids.every(validateUUID)) {
		throw Object.assign(new Error('Evaluators must belong to this Organization'), { status: 400 });
	}
	if (!ctx.personnelRatingSchemeRoster) throw new Error('Personnel Rating Scheme roster provider unavailable');
	if (!(await ctx.personnelRatingSchemeRoster.hasEvaluatorReferences(ctx.auth, ids))) {
		throw Object.assign(new Error('Evaluators must belong to this Organization'), { status: 400 });
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
			(await findRatingSchemeEntry(ctx, id)).rated_person_id,
			POLICY_ACTION_CATALOG.ratingScheme.requestEntryDeletion
		),
		AUDIT_RESOURCE,
		id
	);
}

export async function createRatingSchemeEntry(
	ctx: RatingSchemeEntryWriteContext,
	data: Record<string, unknown>
): Promise<RatingSchemeEntry> {
	const validated = entity.createSchema.parse(data);
	await requireRatingSchemeUpdatePolicy(
		ctx,
		await policyResourceForRatedPerson(ctx, optionalPersonnelId(validated.ratedPersonId))
	);

	const dbData = coerceEmptyStrings(entity.toDbInsert(validated, ctx.auth.orgId));
	await requireEvaluatorReferences(ctx, dbData);
	const row = await ctx.store.insert<Record<string, unknown>>(entity.table, ctx.auth.orgId, dbData, entity.select);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.created`,
		resourceType: AUDIT_RESOURCE,
		resourceId: row.id as string | undefined
	});

	return entity.fromDb(row);
}

export async function updateRatingSchemeEntry(
	ctx: RatingSchemeEntryWriteContext,
	data: Record<string, unknown>
): Promise<RatingSchemeEntry> {
	const validated = entity.updateSchema.parse(data);
	const { id } = validated as { id: string };

	const current = await findRatingSchemeEntry(ctx, id);
	await requireRatingSchemeUpdatePolicy(ctx, await policyResourceForRatedPerson(ctx, current.rated_person_id), id);
	if (validated.ratedPersonId !== undefined) {
		await requireRatingSchemeUpdatePolicy(
			ctx,
			await policyResourceForRatedPerson(ctx, optionalPersonnelId(validated.ratedPersonId)),
			id
		);
	}

	const dbData = coerceEmptyStrings(entity.toDbUpdate(validated));
	await requireEvaluatorReferences(ctx, dbData, current);
	const row = await ctx.store.update<Record<string, unknown>>(entity.table, ctx.auth.orgId, id, dbData, entity.select);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.updated`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id
	});

	return entity.fromDb(row);
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

	await ctx.store.delete(entity.table, ctx.auth.orgId, id);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.deleted`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id
	});

	await ctx.notifyRatingSchemeEntryDeleted();
}

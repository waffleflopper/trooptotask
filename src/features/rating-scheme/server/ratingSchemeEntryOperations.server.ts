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
	Evaluation,
	EvaluatorChain,
	EvaluationStartResult,
	EvaluationTransition,
	EvaluationWriteReference,
	RatingScheme,
	RatingSchemeArchiveResult,
	RatingSchemePersistence,
	RatingSchemePatchValues,
	RatingSchemeRaterChangeResult
} from '../contracts';
import {
	evaluationStartSchema,
	evaluationUpdateSchema,
	ratingSchemeArchiveSchema,
	ratingSchemeCreateSchema,
	ratingSchemeRaterChangeSchema,
	ratingSchemeTransitionSchema,
	ratingSchemeUpdateSchema
} from './ratingSchemeEntryMapping.server';
import { EVALUATION_GONE, RATING_SCHEME_GONE } from './ratingSchemeLifecycleFailure.server';
import { validateUUID } from '$lib/server/validation';
import { policyResourceForGroup, requireFeaturePolicy, requireGovernancePolicy } from '$lib/access/index.server';
import { RequestFailure } from '$lib/errors';
import { issueMessage } from '$lib/utils/inputSchemas';

export {
	evaluationStartSchema,
	evaluationUpdateSchema,
	ratingSchemeCreateSchema,
	ratingSchemeUpdateSchema
} from './ratingSchemeEntryMapping.server';

export interface RatingSchemeEntryWriteContext {
	readonly auth: OrganizationAccessGrant;
	readonly audit: PolicyAuditSink;
	readonly ratingScheme: Pick<
		RatingSchemePersistence,
		| 'findRatingScheme'
		| 'findEvaluationReference'
		| 'createRatingScheme'
		| 'updateRatingScheme'
		| 'setRatingSchemeArchived'
		| 'startEvaluation'
		| 'updateEvaluation'
		| 'deleteEvaluation'
		| 'transitionEvaluation'
		| 'changeEvaluationRater'
	>;
	readonly personnelRatingSchemeRoster?: Pick<
		PersonnelRatingSchemeRosterPort,
		'findRatedPersonForWrite' | 'hasEvaluatorReferences'
	>;
}

export interface RatingSchemeEntryDeleteContext extends RatingSchemeEntryWriteContext {
	readonly notifyEvaluationDeleted: () => Promise<void>;
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

async function findRatingScheme(ctx: RatingSchemeEntryWriteContext, id: string): Promise<RatingScheme> {
	if (!validateUUID(id)) throw new RequestFailure(404, RATING_SCHEME_GONE);
	const scheme = await ctx.ratingScheme.findRatingScheme(id);
	if (!scheme) throw new RequestFailure(404, RATING_SCHEME_GONE);
	return scheme;
}

async function findEvaluation(ctx: RatingSchemeEntryWriteContext, id: string): Promise<EvaluationWriteReference> {
	if (!validateUUID(id)) throw new RequestFailure(404, EVALUATION_GONE);
	const evaluation = await ctx.ratingScheme.findEvaluationReference(id);
	if (!evaluation) throw new RequestFailure(404, EVALUATION_GONE);
	return evaluation;
}

async function requireEvaluatorReferences(
	ctx: RatingSchemeEntryWriteContext,
	patch: RatingSchemePatchValues,
	current?: Partial<EvaluatorChain>
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

async function requireEvaluationDeletionRequestPolicy(ctx: RatingSchemeEntryWriteContext, id: string): Promise<void> {
	const action = POLICY_ACTION_CATALOG.ratingScheme.requestEntryDeletion;
	const { ratedPersonId } = await findEvaluation(ctx, id);
	await requireFeaturePolicy(
		ctx,
		action,
		await policyResourceForRatedPerson(ctx, ratedPersonId, action),
		AUDIT_RESOURCE,
		id
	);
}

async function requireRatedPersonUpdatePolicy(
	ctx: RatingSchemeEntryWriteContext,
	ratedPersonId: string,
	resourceId: string
): Promise<void> {
	await requireRatingSchemeUpdatePolicy(ctx, await policyResourceForRatedPerson(ctx, ratedPersonId), resourceId);
}

/** Lists a Rated Individual's rating chain; the person may have no other listed scheme. */
export async function createRatingScheme(
	ctx: RatingSchemeEntryWriteContext,
	data: Record<string, unknown>
): Promise<RatingScheme> {
	const validated = parseEntryInput(ratingSchemeCreateSchema, data);
	await requireRatingSchemeUpdatePolicy(ctx, await policyResourceForRatedPerson(ctx, validated.ratedPersonId));
	await requireEvaluatorReferences(ctx, validated);
	return ctx.ratingScheme.createRatingScheme(validated);
}

/** Changes the chain in one place. The rater of an open Evaluation changes only through Change rater. */
export async function updateRatingScheme(
	ctx: RatingSchemeEntryWriteContext,
	data: Record<string, unknown>
): Promise<RatingScheme> {
	const { id, ...validated } = parseEntryInput(ratingSchemeUpdateSchema, data);
	const current = await findRatingScheme(ctx, id);
	await requireRatedPersonUpdatePolicy(ctx, current.ratedPersonId, id);
	if (validated.ratedPersonId !== undefined) await requireRatedPersonUpdatePolicy(ctx, validated.ratedPersonId, id);
	await requireEvaluatorReferences(ctx, validated, current);
	const scheme = await ctx.ratingScheme.updateRatingScheme(id, validated);
	if (!scheme) throw new RequestFailure(404, RATING_SCHEME_GONE);
	return scheme;
}

/** Takes a scheme off the rating scheme or puts it back; its open Evaluation stays on the tracker until it completes. */
export async function setRatingSchemeArchived(
	ctx: RatingSchemeEntryWriteContext,
	id: string,
	data: Record<string, unknown>
): Promise<RatingSchemeArchiveResult> {
	const { archived } = parseEntryInput(ratingSchemeArchiveSchema, data);
	await requireRatedPersonUpdatePolicy(ctx, (await findRatingScheme(ctx, id)).ratedPersonId, id);
	return ctx.ratingScheme.setRatingSchemeArchived(id, archived);
}

/** Opens the next Evaluation at Drafting with the scheme's chain, or records one already completed. */
export async function startEvaluation(
	ctx: RatingSchemeEntryWriteContext,
	ratingSchemeId: string,
	data: Record<string, unknown>
): Promise<EvaluationStartResult> {
	const start = parseEntryInput(evaluationStartSchema, data);
	await requireRatedPersonUpdatePolicy(
		ctx,
		(await findRatingScheme(ctx, ratingSchemeId)).ratedPersonId,
		ratingSchemeId
	);
	return ctx.ratingScheme.startEvaluation(ratingSchemeId, start);
}

/** Saves an Evaluation's report, period and notes. Its type follows its scheme; its step and chain move through their own actions. */
export async function updateEvaluation(
	ctx: RatingSchemeEntryWriteContext,
	data: Record<string, unknown>
): Promise<Evaluation> {
	const { id, reportType, ratingPeriodStart, ratingPeriodEnd, notes } = parseEntryInput(
		evaluationUpdateSchema,
		data
	);
	await requireRatedPersonUpdatePolicy(ctx, (await findEvaluation(ctx, id)).ratedPersonId, id);
	const evaluation = await ctx.ratingScheme.updateEvaluation(id, {
		reportType: reportType as Evaluation['reportType'] | undefined,
		ratingPeriodStart,
		ratingPeriodEnd,
		notes
	});
	if (!evaluation) throw new RequestFailure(404, EVALUATION_GONE);
	return evaluation;
}

async function requireEvaluationUpdatePolicy(
	ctx: RatingSchemeEntryWriteContext,
	id: string
): Promise<EvaluationWriteReference> {
	const current = await findEvaluation(ctx, id);
	await requireRatedPersonUpdatePolicy(ctx, current.ratedPersonId, id);
	return current;
}

/** Moves an evaluation to another present step; the database refuses any other move. */
export async function transitionEvaluation(
	ctx: RatingSchemeEntryWriteContext,
	id: string,
	data: Record<string, unknown>
): Promise<EvaluationTransition> {
	const move = parseEntryInput(ratingSchemeTransitionSchema, data);
	await requireEvaluationUpdatePolicy(ctx, id);
	return ctx.ratingScheme.transitionEvaluation(id, move);
}

/** Completes the evaluation as a Change of Rater report, gives the scheme the new rater and opens the next one. */
export async function changeEvaluationRater(
	ctx: RatingSchemeEntryWriteContext,
	id: string,
	data: Record<string, unknown>
): Promise<RatingSchemeRaterChangeResult> {
	const change = parseEntryInput(ratingSchemeRaterChangeSchema, data);
	const current = await requireEvaluationUpdatePolicy(ctx, id);
	await requireEvaluatorReferences(ctx, { raterPersonId: change.raterPersonId }, current);
	return ctx.ratingScheme.changeEvaluationRater(id, change);
}

export async function removeEvaluation(
	ctx: RatingSchemeEntryDeleteContext,
	id: string
): Promise<{ requiresApproval: true } | void> {
	await requireEvaluationDeletionRequestPolicy(ctx, id);

	if (!ctx.auth.isPrivileged) {
		return { requiresApproval: true };
	}

	await requireGovernancePolicy(ctx, POLICY_ACTION_CATALOG.organization.deleteRatingSchemeEntry);

	await ctx.ratingScheme.deleteEvaluation(id);

	await ctx.notifyEvaluationDeleted();
}

/** Describes a deletion request from the Evaluation the requester may ask to remove. */
export async function describeEvaluationDeletionRequest(
	ctx: RatingSchemeEntryWriteContext,
	id: string
): Promise<{ description: string; url: string }> {
	const action = POLICY_ACTION_CATALOG.ratingScheme.requestEntryDeletion;
	const { ratedPersonId } = await findEvaluation(ctx, id);
	const person = await ratedPersonForWrite(ctx, ratedPersonId, action);
	await requireFeaturePolicy(ctx, action, policyResourceForGroup(person.groupId), AUDIT_RESOURCE, id);
	return {
		description: `Evaluation for ${person.rank} ${person.lastName}`,
		url: `/org/${ctx.auth.orgId}/evals`
	};
}

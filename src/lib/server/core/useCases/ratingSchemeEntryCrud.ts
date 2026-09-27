/**
 * Rating scheme entry CRUD use cases — create, update, delete rating level definitions.
 *
 * Rating scheme entries define the scoring levels for personnel evaluations (e.g., 1–5 scale
 * with labels and descriptions). Requires `WriteWithNotificationsPorts` because changes
 * notify admins so they can update affected personnel records.
 *
 * Empty string fields are coerced to null before persistence (optional fields pattern).
 */
import { POLICY_ACTION_CATALOG, type FeatureLanePolicyAction, type PolicyResource } from '$lib/access/policyEvaluator';
import { RatingSchemeEntryEntity } from '$lib/server/entities/ratingSchemeEntry';
import type { WriteWithNotificationsPorts } from '$lib/server/core/ports';
import { policyResourceForGroup, requireFeaturePolicy } from './featurePolicy';
import { requireGovernancePolicy } from './governancePolicy';

const entity = RatingSchemeEntryEntity;
export const ratingSchemeEntryCreateSchema = entity.createSchema;
export const ratingSchemeEntryUpdateSchema = entity.updateSchema;
const AUDIT_RESOURCE = 'rating_scheme';
type RatingSchemePolicyPorts = WriteWithNotificationsPorts & { rawStore?: WriteWithNotificationsPorts['store'] };

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
	ctx: RatingSchemePolicyPorts,
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

async function policyResourceForRatingSchemeEntry(
	ctx: RatingSchemePolicyPorts,
	id: string,
	denialAction: FeatureLanePolicyAction = POLICY_ACTION_CATALOG.ratingScheme.updateEntries
): Promise<PolicyResource> {
	const entry = await (ctx.rawStore ?? ctx.store).findOne<{ rated_person_id: string | null }>(
		entity.table,
		ctx.auth.orgId,
		{
			id
		}
	);
	if (!entry) throw Object.assign(new Error('Rating Scheme entry not found'), { status: 404 });
	return policyResourceForRatedPerson(ctx, entry.rated_person_id, denialAction);
}

async function requireRatingSchemeUpdatePolicy(
	ctx: WriteWithNotificationsPorts,
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

export async function requireRatingSchemeEntryDeletionRequestPolicy(
	ctx: WriteWithNotificationsPorts,
	id: string
): Promise<void> {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.ratingScheme.requestEntryDeletion,
		await policyResourceForRatingSchemeEntry(ctx, id, POLICY_ACTION_CATALOG.ratingScheme.requestEntryDeletion),
		AUDIT_RESOURCE,
		id
	);
}

export interface RatingSchemeEntryUseCases {
	create(ctx: WriteWithNotificationsPorts, data: Record<string, unknown>): Promise<unknown>;
	update(ctx: WriteWithNotificationsPorts, data: Record<string, unknown>): Promise<unknown>;
	remove(ctx: WriteWithNotificationsPorts, id: string): Promise<{ requiresApproval: boolean } | void>;
}

export function createRatingSchemeEntryUseCases(): RatingSchemeEntryUseCases {
	return {
		async create(ctx, data) {
			const validated = entity.createSchema.parse(data);
			await requireRatingSchemeUpdatePolicy(
				ctx,
				await policyResourceForRatedPerson(ctx, optionalPersonnelId(validated.ratedPersonId))
			);

			const dbData = coerceEmptyStrings(entity.toDbInsert(validated, ctx.auth.orgId));
			const row = await ctx.store.insert<Record<string, unknown>>(entity.table, ctx.auth.orgId, dbData, entity.select);

			ctx.audit.log({
				action: `${AUDIT_RESOURCE}.created`,
				resourceType: AUDIT_RESOURCE,
				resourceId: row.id as string | undefined
			});

			return entity.fromDb(row);
		},

		async update(ctx, data) {
			const validated = entity.updateSchema.parse(data);
			const { id } = validated as { id: string };

			await requireRatingSchemeUpdatePolicy(ctx, await policyResourceForRatingSchemeEntry(ctx, id), id);
			if (validated.ratedPersonId !== undefined) {
				await requireRatingSchemeUpdatePolicy(
					ctx,
					await policyResourceForRatedPerson(ctx, optionalPersonnelId(validated.ratedPersonId)),
					id
				);
			}

			const dbData = coerceEmptyStrings(entity.toDbUpdate(validated));
			const row = await ctx.store.update<Record<string, unknown>>(
				entity.table,
				ctx.auth.orgId,
				id,
				dbData,
				entity.select
			);

			ctx.audit.log({
				action: `${AUDIT_RESOURCE}.updated`,
				resourceType: AUDIT_RESOURCE,
				resourceId: id
			});

			return entity.fromDb(row);
		},

		async remove(ctx, id) {
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

			await ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
				type: 'config_type_deleted',
				title: 'Rating Scheme Entry Deleted',
				message: 'A rating scheme entry was deleted.'
			});
		}
	};
}

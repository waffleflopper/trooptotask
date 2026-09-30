import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { PersonnelEntity } from './personnelEntity.server';
import { normalizeActivePersonnelRank } from './rankValidation.server';
import {
	buildUniquePersonnelSlug,
	isPersonnelSlugUniqueConstraintError,
	type PersonnelSlugReadStore
} from './personnelSlug.server';

interface PersonnelRecordContext {
	auth: Parameters<typeof requireFeaturePolicy>[0]['auth'];
	audit: NonNullable<Parameters<typeof requireFeaturePolicy>[0]['audit']>;
	store: PersonnelSlugReadStore & {
		findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;
		insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T>;
		update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;
	};
	rawStore?: PersonnelSlugReadStore;
}

const entity = PersonnelEntity;
const AUDIT_RESOURCE = 'personnel';
const SLUG_RETRY_LIMIT = 3;

function fail(status: number, message: string): never {
	throw Object.assign(new Error(message), { status });
}

function errorStatus(error: unknown): number | undefined {
	return typeof error === 'object' && error !== null && 'status' in error
		? (error as { status?: number }).status
		: undefined;
}

function rankCodesMatchCanonical(left: string, right: string | undefined): boolean {
	return right !== undefined && left.trim().toUpperCase() === right.trim().toUpperCase();
}

async function requireGroupInOrganization(
	ctx: PersonnelRecordContext,
	groupId: string | null | undefined
): Promise<void> {
	if (!groupId) return;
	const group = await ctx.store.findOne<{ id: string }>('groups', ctx.auth.orgId, { id: groupId }, 'id');
	if (!group) fail(404, 'Group not found.');
}

export async function createPersonnelRecord(ctx: PersonnelRecordContext, data: Record<string, unknown>) {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.createRecords,
		policyResourceForGroup(data.groupId),
		AUDIT_RESOURCE
	);

	const validated = entity.createSchema.parse(data);
	await requireGroupInOrganization(ctx, validated.groupId as string | null | undefined);
	validated.rank = await normalizeActivePersonnelRank(ctx, (validated as { rank: string }).rank);
	const dbData = entity.toDbInsert(validated, ctx.auth.orgId);
	if (validated.groupId !== undefined) dbData.group_id = validated.groupId || null;
	let row: Record<string, unknown> | null = null;
	const rejectedSlugs = new Set<string>();
	for (let attempt = 1; attempt <= SLUG_RETRY_LIMIT; attempt += 1) {
		dbData.slug = await buildUniquePersonnelSlug({
			store: ctx.rawStore ?? ctx.store,
			orgId: ctx.auth.orgId,
			lastName: validated.lastName as string,
			firstName: validated.firstName as string,
			rejectedSlugs
		});

		try {
			row = await ctx.store.insert<Record<string, unknown>>(entity.table, ctx.auth.orgId, dbData, entity.select);
			break;
		} catch (error) {
			if (attempt === SLUG_RETRY_LIMIT || !isPersonnelSlugUniqueConstraintError(error)) throw error;
			rejectedSlugs.add(dbData.slug as string);
		}
	}

	if (!row) fail(500, 'Unable to create personnel record.');

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.created`,
		resourceType: AUDIT_RESOURCE,
		resourceId: row.id as string | undefined
	});

	return entity.fromDb(row);
}

export async function updatePersonnelRecord(ctx: PersonnelRecordContext, data: Record<string, unknown>) {
	const validated = entity.updateSchema.parse(data);
	const { id, groupId: nextGroupId } = validated as { id: string; groupId?: string | null };
	const currentRecord = await ctx.store.findOne<{
		rank: string;
		group_id: string | null;
		last_name: string;
		first_name: string;
	}>(entity.table, ctx.auth.orgId, { id });

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		policyResourceForGroup(currentRecord?.group_id),
		AUDIT_RESOURCE,
		id
	);

	if (nextGroupId !== undefined) {
		await requireFeaturePolicy(
			ctx,
			POLICY_ACTION_CATALOG.personnel.manageRecords,
			policyResourceForGroup(nextGroupId),
			AUDIT_RESOURCE,
			id
		);
		await requireGroupInOrganization(ctx, nextGroupId);
	}

	const nextRank = (validated as { rank?: string }).rank;
	if (nextRank !== undefined) {
		if (currentRecord?.rank !== undefined && nextRank.trim() === currentRecord.rank) {
			validated.rank = currentRecord.rank;
		} else {
			try {
				validated.rank = await normalizeActivePersonnelRank(ctx, nextRank);
			} catch (error) {
				if (errorStatus(error) === 400 && rankCodesMatchCanonical(nextRank, currentRecord?.rank)) {
					validated.rank = currentRecord?.rank;
				} else {
					throw error;
				}
			}
		}
	}

	const dbData = entity.toDbUpdate(validated);
	if (nextGroupId !== undefined) {
		dbData.group_id = nextGroupId || null;
	}
	const shouldRegenerateSlug = validated.lastName !== undefined || validated.firstName !== undefined;
	let row: Record<string, unknown> | null = null;
	const rejectedSlugs = new Set<string>();
	for (let attempt = 1; attempt <= SLUG_RETRY_LIMIT; attempt += 1) {
		if (shouldRegenerateSlug) {
			dbData.slug = await buildUniquePersonnelSlug({
				store: ctx.rawStore ?? ctx.store,
				orgId: ctx.auth.orgId,
				excludePersonnelId: id,
				lastName: (validated.lastName as string | undefined) ?? currentRecord?.last_name ?? '',
				firstName: (validated.firstName as string | undefined) ?? currentRecord?.first_name ?? '',
				rejectedSlugs
			});
		}

		try {
			row = await ctx.store.update<Record<string, unknown>>(entity.table, ctx.auth.orgId, id, dbData, entity.select);
			break;
		} catch (error) {
			if (!shouldRegenerateSlug || attempt === SLUG_RETRY_LIMIT || !isPersonnelSlugUniqueConstraintError(error)) {
				throw error;
			}
			rejectedSlugs.add(dbData.slug as string);
		}
	}

	if (!row) fail(500, 'Unable to update personnel record.');

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.updated`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id
	});

	return entity.fromDb(row);
}

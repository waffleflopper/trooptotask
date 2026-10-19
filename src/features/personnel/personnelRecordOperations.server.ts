import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { z } from 'zod';
import {
	PERSONNEL_FIRST_NAME_REQUIRED_MESSAGE,
	PERSONNEL_LAST_NAME_REQUIRED_MESSAGE,
	type Personnel,
	type PersonnelRecordPersistence,
	type GroupPersistence
} from './contracts';
import { normalizeActivePersonnelRank } from './rankValidation.server';
import { buildUniquePersonnelSlug, isPersonnelSlugUniqueConstraintError } from './personnelSlug.server';
import { fail, RequestFailure } from '$lib/errors';
import { dateOnlySchema, uuidSchema } from '$lib/utils/inputSchemas';
import { failField, failParse } from './personnelFieldFailure';

interface PersonnelRecordContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	personnel: Pick<PersonnelRecordPersistence, 'findWriteReference' | 'create' | 'updateEditable'>;
	organizationPersonnel: Pick<PersonnelRecordPersistence, 'listSlugCandidates'>;
	groups: Pick<GroupPersistence, 'findReference'>;
	loadRankCatalog: Parameters<typeof normalizeActivePersonnelRank>[0]['loadRankCatalog'];
}

const editableShape = {
	rank: z.string({ error: 'Rank is required' }),
	lastName: z.string({ error: PERSONNEL_LAST_NAME_REQUIRED_MESSAGE }),
	firstName: z.string({ error: PERSONNEL_FIRST_NAME_REQUIRED_MESSAGE }),
	mos: z.string({ error: 'MOS must be text' }).optional(),
	clinicRole: z.string({ error: 'Duty role is required' }),
	ets: dateOnlySchema.nullable().optional(),
	deros: dateOnlySchema.nullable().optional(),
	/** An empty Group choice means unassigned. */
	groupId: z.preprocess((value) => (value === '' ? null : value), uuidSchema.nullable().optional())
};
const createInput = z.object(editableShape);
const updateInput = createInput.partial().extend({ id: uuidSchema });

function parseInput<T>(schema: z.ZodType<T>, data: unknown): T {
	const parsed = schema.safeParse(data);
	if (!parsed.success) failParse(parsed.error);
	return parsed.data;
}

const AUDIT_RESOURCE = 'personnel';
const PERSONNEL_RECORD_UNAVAILABLE_MESSAGE = 'This person is no longer available.';
const SLUG_RETRY_LIMIT = 3;

function rankCodesMatchCanonical(left: string, right: string | undefined): boolean {
	return right !== undefined && left.trim().toUpperCase() === right.trim().toUpperCase();
}

function requireNames(names: { lastName?: string; firstName?: string }): void {
	if (names.lastName?.trim() === '') failField('lastName', PERSONNEL_LAST_NAME_REQUIRED_MESSAGE);
	if (names.firstName?.trim() === '') failField('firstName', PERSONNEL_FIRST_NAME_REQUIRED_MESSAGE);
}

async function requireGroupInOrganization(
	ctx: PersonnelRecordContext,
	groupId: string | null | undefined
): Promise<void> {
	if (!groupId) return;
	const group = await ctx.groups.findReference(groupId);
	if (!group) fail(404, 'Group not found.', { reason: 'field:groupId' });
}

export async function createPersonnelRecord(ctx: PersonnelRecordContext, data: Record<string, unknown>) {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.createRecords,
		policyResourceForGroup(data.groupId),
		AUDIT_RESOURCE
	);

	const validated = parseInput(createInput, data);
	requireNames(validated);
	await requireGroupInOrganization(ctx, validated.groupId as string | null | undefined);
	validated.rank = await normalizeActivePersonnelRank(ctx, (validated as { rank: string }).rank);
	const record = { ...validated, slug: '' };
	if (validated.groupId !== undefined) record.groupId = validated.groupId || null;
	let row: Personnel | null = null;
	const rejectedSlugs = new Set<string>();
	for (let attempt = 1; attempt <= SLUG_RETRY_LIMIT; attempt += 1) {
		record.slug = await buildUniquePersonnelSlug({
			organizationPersonnel: ctx.organizationPersonnel,
			lastName: validated.lastName as string,
			firstName: validated.firstName as string,
			rejectedSlugs
		});

		try {
			row = await ctx.personnel.create(record);
			break;
		} catch (error) {
			if (attempt === SLUG_RETRY_LIMIT || !isPersonnelSlugUniqueConstraintError(error)) throw error;
			rejectedSlugs.add(record.slug as string);
		}
	}

	if (!row) fail(500, 'Unable to create personnel record.');

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.created`,
		resourceType: AUDIT_RESOURCE,
		resourceId: row.id as string | undefined
	});

	return row;
}

/** A validated, authorized Person update; applying it is the only write. */
export interface PreparedPersonnelRecordUpdate {
	id: string;
	patch: Omit<z.infer<typeof updateInput>, 'id'> & { slug?: string };
	currentRecord: NonNullable<Awaited<ReturnType<PersonnelRecordContext['personnel']['findWriteReference']>>>;
}

export async function preparePersonnelRecordUpdate(
	ctx: PersonnelRecordContext,
	data: Record<string, unknown>
): Promise<PreparedPersonnelRecordUpdate> {
	const { id, ...editable } = parseInput(updateInput, data);
	const patch: PreparedPersonnelRecordUpdate['patch'] = editable;
	const nextGroupId = patch.groupId;
	const currentRecord = await ctx.personnel.findWriteReference(id);

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		policyResourceForGroup(currentRecord?.groupId),
		AUDIT_RESOURCE,
		id
	);
	if (!currentRecord) fail(404, PERSONNEL_RECORD_UNAVAILABLE_MESSAGE);
	requireNames(patch);

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

	const nextRank = (patch as { rank?: string }).rank;
	if (nextRank !== undefined) {
		if (currentRecord?.rank !== undefined && nextRank.trim() === currentRecord.rank) {
			patch.rank = currentRecord.rank;
		} else {
			try {
				patch.rank = await normalizeActivePersonnelRank(ctx, nextRank);
			} catch (error) {
				if (!(error instanceof RequestFailure) || error.status !== 400) throw error;
				if (!rankCodesMatchCanonical(nextRank, currentRecord.rank)) failField('rank', error.message);
				patch.rank = currentRecord.rank;
			}
		}
	}

	if (nextGroupId !== undefined) {
		patch.groupId = nextGroupId || null;
	}
	return { id, patch, currentRecord };
}

export async function applyPersonnelRecordUpdate(
	ctx: PersonnelRecordContext,
	{ id, patch, currentRecord }: PreparedPersonnelRecordUpdate
) {
	const shouldRegenerateSlug = patch.lastName !== undefined || patch.firstName !== undefined;
	let row: Personnel | null = null;
	const rejectedSlugs = new Set<string>();
	for (let attempt = 1; attempt <= SLUG_RETRY_LIMIT; attempt += 1) {
		if (shouldRegenerateSlug) {
			patch.slug = await buildUniquePersonnelSlug({
				organizationPersonnel: ctx.organizationPersonnel,
				excludePersonnelId: id,
				lastName: (patch.lastName as string | undefined) ?? currentRecord.lastName ?? '',
				firstName: (patch.firstName as string | undefined) ?? currentRecord.firstName ?? '',
				rejectedSlugs
			});
		}

		try {
			row = await ctx.personnel.updateEditable(id, patch);
			break;
		} catch (error) {
			if (!shouldRegenerateSlug || attempt === SLUG_RETRY_LIMIT || !isPersonnelSlugUniqueConstraintError(error)) {
				throw error;
			}
			rejectedSlugs.add(patch.slug as string);
		}
	}

	if (!row) fail(404, PERSONNEL_RECORD_UNAVAILABLE_MESSAGE);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.updated`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id
	});

	return row;
}

export async function updatePersonnelRecord(ctx: PersonnelRecordContext, data: Record<string, unknown>) {
	return applyPersonnelRecordUpdate(ctx, await preparePersonnelRecordUpdate(ctx, data));
}

import { evaluatePolicyDecision, POLICY_ACTION_CATALOG, type PolicyResource } from '$lib/access/policyEvaluator';
import { trainingCompletionCreateInput, trainingCompletionUpdateInput } from './trainingPersistenceMapping.server';
import type {
	TrainingPersonnelWriteAuthority,
	TrainingRecordCreateContext,
	TrainingRecordUpdateContext,
	TrainingRecordDeleteContext,
	TrainingRecordDeletionRequestContext
} from './trainingCompletionPorts.server';
import { calculateExpirationDate } from '../utils/trainingStatus';
import type {
	SavedTrainingCompletion,
	TrainingCompletionResource,
	TrainingCompletionPatch,
	TrainingCompletionPersistence
} from '../contracts';
import type { PersonnelWriteSubject } from '$features/personnel/contracts';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { fail } from '$lib/errors';
import type { z } from 'zod';

const AUDIT_RESOURCE = 'training_record';

function parseTrainingRecordInput<T>(schema: z.ZodType<T>, input: unknown): T {
	const parsed = schema.safeParse(input);
	if (!parsed.success) fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	return parsed.data;
}

function canHardDeleteTrainingRecord(ctx: TrainingPersonnelWriteAuthority, resource: PolicyResource): boolean {
	return evaluatePolicyDecision({
		decisionKind: 'server-authoritative',
		actor: { membershipRole: ctx.auth.role },
		action: POLICY_ACTION_CATALOG.training.configureRequirements,
		capabilityMap: ctx.auth.capabilityMap,
		scopeSet: ctx.auth.scopeSet,
		resource
	}).allowed;
}

async function trainingWriteSubjects(
	ctx: TrainingPersonnelWriteAuthority,
	personnelIds: string[],
	resourceId?: string
): Promise<Map<string, PersonnelWriteSubject>> {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.training.recordCompletions,
		{ kind: 'unscoped' },
		AUDIT_RESOURCE,
		resourceId
	);
	if (!ctx.personnelTrainingRoster) throw new Error('Personnel Training roster provider unavailable');
	const subjects = await ctx.personnelTrainingRoster.findWriteSubjects(ctx.auth, personnelIds);
	for (const id of personnelIds) {
		if (!subjects.has(id)) {
			await requireFeaturePolicy(
				ctx,
				POLICY_ACTION_CATALOG.training.recordCompletions,
				{ kind: 'organization' },
				AUDIT_RESOURCE,
				resourceId ?? id
			);
			fail(404, 'Personnel not found');
		}
	}
	return subjects;
}

export async function policyResourcesForTrainingPersonnel(
	ctx: TrainingPersonnelWriteAuthority,
	personnelIds: string[],
	resourceId?: string
): Promise<Map<string, PolicyResource>> {
	const subjects = await trainingWriteSubjects(ctx, personnelIds, resourceId);
	const resources = new Map<string, PolicyResource>();
	for (const id of personnelIds) resources.set(id, policyResourceForGroup(subjects.get(id)?.groupId));
	return resources;
}

async function policyResourceForTrainingPersonnel(
	ctx: TrainingPersonnelWriteAuthority,
	personnelId: string,
	resourceId?: string
) {
	const resources = await policyResourcesForTrainingPersonnel(ctx, [personnelId], resourceId);
	return resources.get(personnelId) ?? { kind: 'organization' as const };
}

async function loadTrainingRecordResource(
	ctx: TrainingPersonnelWriteAuthority & {
		readonly trainingCompletions: Pick<TrainingCompletionPersistence, 'findResource'>;
	},
	recordId: string
): Promise<{ record: TrainingCompletionResource | null; resource: PolicyResource }> {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.training.recordCompletions,
		{ kind: 'unscoped' },
		AUDIT_RESOURCE,
		recordId
	);
	const record = await ctx.trainingCompletions.findResource(recordId);
	if (!record?.personnelId) {
		return { record, resource: { kind: 'organization' } };
	}
	return { record, resource: await policyResourceForTrainingPersonnel(ctx, record.personnelId, recordId) };
}

export async function createTrainingRecord(
	ctx: TrainingRecordCreateContext,
	input: Record<string, unknown>
): Promise<SavedTrainingCompletion> {
	const validated = parseTrainingRecordInput(trainingCompletionCreateInput, input);
	const personnelId = validated.personnelId;
	const trainingTypeId = validated.trainingTypeId;
	const completionDate = validated.completionDate ?? null;

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.training.recordCompletions,
		await policyResourceForTrainingPersonnel(ctx, personnelId),
		AUDIT_RESOURCE
	);

	const trainingType = await ctx.trainingCatalog.findTypeTiming(trainingTypeId);

	if (!trainingType) fail(404, 'Training type not found');

	const isExpirationDateOnly = trainingType.expirationDateOnly ?? false;

	const expirationDate = isExpirationDateOnly
		? validated.expirationDate
		: calculateExpirationDate(completionDate, trainingType.expirationMonths);

	const existing = await ctx.trainingCompletions.findPair(personnelId, trainingTypeId);
	const fields = {
		completionDate: completionDate ?? null,
		expirationDate: expirationDate ?? null,
		notes: validated.notes ?? null,
		certificateUrl: validated.certificateUrl ?? null
	};
	let row: SavedTrainingCompletion;
	if (existing) {
		const updates: TrainingCompletionPatch = { updatedAt: new Date().toISOString() };
		if (validated.completionDate !== undefined) updates.completionDate = validated.completionDate;
		if (isExpirationDateOnly) {
			if (validated.expirationDate !== undefined) updates.expirationDate = validated.expirationDate;
		} else if (validated.completionDate !== undefined) {
			updates.expirationDate = expirationDate ?? null;
		}
		if (validated.notes !== undefined) updates.notes = validated.notes;
		if (validated.certificateUrl !== undefined) updates.certificateUrl = validated.certificateUrl;
		row = await ctx.trainingCompletions.patchRecord(existing.id, updates);
	} else {
		row = await ctx.trainingCompletions.createRecord({ personnelId, trainingTypeId, ...fields });
	}

	ctx.audit.log({
		action: existing ? `${AUDIT_RESOURCE}.updated` : `${AUDIT_RESOURCE}.created`,
		resourceType: AUDIT_RESOURCE,
		resourceId: row.id
	});

	return row;
}

export async function updateTrainingRecord(
	ctx: TrainingRecordUpdateContext,
	input: Record<string, unknown>
): Promise<SavedTrainingCompletion> {
	const { id, ...fields } = parseTrainingRecordInput(trainingCompletionUpdateInput, input);

	const { record: existing, resource } = await loadTrainingRecordResource(ctx, id);
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.training.recordCompletions, resource, AUDIT_RESOURCE, id);

	if (!existing) fail(404, 'Training record not found');

	let isExpirationDateOnly = false;
	let expirationMonths: number | null = null;

	const trainingType = await ctx.trainingCatalog.findTypeTiming(existing.trainingTypeId);

	if (trainingType) {
		isExpirationDateOnly = trainingType.expirationDateOnly ?? false;
		expirationMonths = trainingType.expirationMonths;
	}

	const updates: TrainingCompletionPatch = { updatedAt: new Date().toISOString() };

	if (fields.completionDate !== undefined) {
		updates.completionDate = fields.completionDate;
	}

	if (isExpirationDateOnly) {
		if (fields.expirationDate !== undefined) {
			updates.expirationDate = fields.expirationDate;
		}
	} else if (fields.completionDate !== undefined) {
		updates.expirationDate = calculateExpirationDate(fields.completionDate as string, expirationMonths);
	}

	if (fields.notes !== undefined) updates.notes = fields.notes;
	if (fields.certificateUrl !== undefined) updates.certificateUrl = fields.certificateUrl;

	const row = await ctx.trainingCompletions.patchRecord(id, updates);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.updated`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id,
		details: {
			personnel_id: row.personnelId,
			training_type_id: row.trainingTypeId,
			completion_date: row.completionDate
		}
	});

	return row;
}

export async function deleteTrainingRecord(
	ctx: TrainingRecordDeleteContext,
	id: string
): Promise<{ requiresApproval: boolean } | void> {
	const { resource } = await loadTrainingRecordResource(ctx, id);
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.training.recordCompletions, resource, AUDIT_RESOURCE, id);

	if (!canHardDeleteTrainingRecord(ctx, resource)) {
		return { requiresApproval: true };
	}

	await ctx.trainingCompletions.deleteRecord(id);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.deleted`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id
	});
}

/** Describes a deletion request from the Training record the requester may change. */
export async function describeTrainingRecordDeletionRequest(
	ctx: TrainingRecordDeletionRequestContext,
	id: string
): Promise<{ description: string; url: string }> {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.training.recordCompletions,
		{ kind: 'unscoped' },
		AUDIT_RESOURCE,
		id
	);
	const record = await ctx.trainingCompletions.findResource(id);
	if (!record?.personnelId) {
		await requireFeaturePolicy(
			ctx,
			POLICY_ACTION_CATALOG.training.recordCompletions,
			{ kind: 'organization' },
			AUDIT_RESOURCE,
			id
		);
		fail(404, 'Training record not found');
	}
	const person = (await trainingWriteSubjects(ctx, [record.personnelId], id)).get(record.personnelId);
	if (!person) fail(404, 'Personnel not found');
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.training.recordCompletions,
		policyResourceForGroup(person.groupId),
		AUDIT_RESOURCE,
		id
	);
	const typeName = (await ctx.trainingCatalog.listTypeLabels()).find((type) => type.id === record.trainingTypeId)?.name;
	return {
		description: `${typeName ?? 'Training'} record for ${person.rank} ${person.lastName}`,
		url: `/org/${ctx.auth.orgId}/training`
	};
}

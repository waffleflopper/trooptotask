import {
	evaluatePolicyDecision,
	POLICY_ACTION_CATALOG,
	type FeatureLanePolicyAction,
	type PolicyResource
} from '$lib/access/policyEvaluator';
import {
	trainingCertificateInput,
	trainingCompletionCorrectionInput,
	trainingCompletionCreateInput,
	trainingCompletionUpdateInput
} from './trainingPersistenceMapping.server';
import type {
	TrainingCertificateOpenContext,
	TrainingCompletionCorrectionContext,
	TrainingCompletionEntryContext,
	TrainingCompletionRecordContext,
	TrainingCompletionRecordInput,
	TrainingPersonnelWriteAuthority,
	TrainingRecordCreateContext,
	TrainingRecordUpdateContext,
	TrainingRecordDeleteContext,
	TrainingRecordDeletionRequestContext
} from './trainingCompletionPorts.server';
import { calculateExpirationDate } from '../utils/trainingStatus';
import type {
	CorrectedTrainingCompletion,
	SavedTrainingCompletion,
	TrainingCompletionEntryResource,
	TrainingCompletionKind,
	TrainingCompletionResource,
	TrainingCompletionPatch,
	TrainingCompletionPersistence,
	TrainingTypeTiming
} from '../contracts';
import { isOwnedTrainingCertificate, trainingCertificatePath } from './trainingCertificateStore.server';
import { validateSensitivePdfFile } from '$lib/storage/sensitiveFiles';
import type { PersonnelWriteSubject } from '$features/personnel/contracts';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { fail } from '$lib/errors';
import type { z } from 'zod';
import { issueMessage } from '$lib/utils/inputSchemas';

const AUDIT_RESOURCE = 'training_record';
const CERTIFICATE_LINK_SECONDS = 5 * 60;

function parseTrainingRecordInput<T>(schema: z.ZodType<T>, input: unknown): T {
	const parsed = schema.safeParse(input);
	if (!parsed.success) fail(400, issueMessage(parsed.error));
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

type TrainingCompletionInput = z.infer<typeof trainingCompletionCreateInput>;

async function authorizeTrainingCompletion(
	ctx: TrainingRecordCreateContext,
	personnelId: string,
	trainingTypeId: string
): Promise<TrainingTypeTiming> {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.training.recordCompletions,
		await policyResourceForTrainingPersonnel(ctx, personnelId),
		AUDIT_RESOURCE
	);
	const trainingType = await ctx.trainingCatalog.findTypeTiming(trainingTypeId);
	if (!trainingType) fail(404, 'Training type not found');
	return trainingType;
}

async function writeTrainingCompletion(
	ctx: TrainingRecordCreateContext,
	validated: TrainingCompletionInput,
	trainingType: TrainingTypeTiming,
	{ keepCertificateOfSameCompletion = false } = {}
): Promise<SavedTrainingCompletion> {
	const personnelId = validated.personnelId;
	const trainingTypeId = validated.trainingTypeId;
	const completionDate = validated.completionDate ?? null;
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
		// Logging the same dates again without a file keeps that completion's certificate, as no history row takes it.
		const sameCompletion =
			(updates.completionDate === undefined || updates.completionDate === existing.completionDate) &&
			(updates.expirationDate === undefined || updates.expirationDate === existing.expirationDate);
		if (validated.certificateUrl !== undefined && !(keepCertificateOfSameCompletion && sameCompletion)) {
			updates.certificateUrl = validated.certificateUrl;
		}
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

export async function createTrainingRecord(
	ctx: TrainingRecordCreateContext,
	input: Record<string, unknown>
): Promise<SavedTrainingCompletion> {
	const validated = parseTrainingRecordInput(trainingCompletionCreateInput, input);
	const trainingType = await authorizeTrainingCompletion(ctx, validated.personnelId, validated.trainingTypeId);
	return writeTrainingCompletion(ctx, validated, trainingType);
}

/** Records a new completion; the superseded one keeps its notes and certificate in history. */
export async function recordTrainingCompletion(
	ctx: TrainingCompletionRecordContext,
	input: TrainingCompletionRecordInput
): Promise<SavedTrainingCompletion> {
	const { certificate, ...fields } = input;
	const parsed = parseTrainingRecordInput(trainingCompletionCreateInput.omit({ certificateUrl: true }), fields);
	const validated = { ...parsed, notes: parsed.notes ?? null };
	if (certificate) {
		const problem = await validateSensitivePdfFile(certificate);
		if (problem) fail(400, problem);
	}
	const trainingType = await authorizeTrainingCompletion(ctx, validated.personnelId, validated.trainingTypeId);
	if (!certificate) {
		return writeTrainingCompletion(ctx, { ...validated, certificateUrl: null }, trainingType, {
			keepCertificateOfSameCompletion: true
		});
	}

	const path = trainingCertificatePath(ctx.auth.orgId, validated.personnelId, certificate.name);
	const upload = await ctx.trainingCertificates.upload(validated.personnelId, path, certificate);
	let record: SavedTrainingCompletion;
	try {
		record = await writeTrainingCompletion(ctx, { ...validated, certificateUrl: path }, trainingType);
	} catch (error) {
		await ctx.trainingCertificates.reconcile(validated.personnelId, path);
		await upload.complete();
		throw error;
	}
	await upload.complete();
	return record;
}

async function loadTrainingCompletionEntry(
	ctx: TrainingCompletionEntryContext,
	action: FeatureLanePolicyAction,
	kind: TrainingCompletionKind,
	id: string
): Promise<TrainingCompletionEntryResource> {
	await requireFeaturePolicy(ctx, action, { kind: 'unscoped' }, AUDIT_RESOURCE, id);
	const entry = await ctx.trainingCompletions.findEntry(kind, id);
	if (!entry) {
		await requireFeaturePolicy(ctx, action, { kind: 'organization' }, AUDIT_RESOURCE, id);
		fail(404, 'Training record not found');
	}
	return entry;
}

/** Fixes a recorded completion in place, so the mistake leaves no history row. */
export async function correctTrainingCompletion(
	ctx: TrainingCompletionCorrectionContext,
	input: Record<string, unknown>
): Promise<CorrectedTrainingCompletion> {
	const { kind, id, completionDate, expirationDate, notes } = parseTrainingRecordInput(
		trainingCompletionCorrectionInput,
		input
	);
	const action = POLICY_ACTION_CATALOG.training.recordCompletions;
	const entry = await loadTrainingCompletionEntry(ctx, action, kind, id);
	await requireFeaturePolicy(
		ctx,
		action,
		await policyResourceForTrainingPersonnel(ctx, entry.personnelId, id),
		AUDIT_RESOURCE,
		id
	);
	const trainingType = await ctx.trainingCatalog.findTypeTiming(entry.trainingTypeId);
	if (!trainingType) fail(404, 'Training type not found');

	const corrected = await ctx.trainingCompletions.correctEntry(kind, id, {
		completionDate,
		expirationDate: trainingType.expirationDateOnly
			? expirationDate === undefined
				? entry.expirationDate
				: expirationDate
			: calculateExpirationDate(completionDate, trainingType.expirationMonths),
		notes: notes === undefined ? entry.notes : notes
	});
	if (!corrected) fail(404, 'Training record not found');

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.corrected`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id,
		details: {
			kind,
			personnel_id: entry.personnelId,
			training_type_id: entry.trainingTypeId,
			completion_date: corrected.completionDate
		}
	});
	return corrected;
}

export async function openTrainingCertificate(
	ctx: TrainingCertificateOpenContext,
	input: Record<string, unknown>
): Promise<string> {
	const { kind, id } = parseTrainingRecordInput(trainingCertificateInput, input);
	const entry = await loadTrainingCompletionEntry(ctx, POLICY_ACTION_CATALOG.training.viewRecords, kind, id);
	const stored = entry.certificateUrl;
	if (!stored || !isOwnedTrainingCertificate(ctx.auth.orgId, entry.personnelId, stored))
		fail(404, 'Certificate not found');
	return ctx.trainingCertificates.signedUrl(stored, CERTIFICATE_LINK_SECONDS);
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

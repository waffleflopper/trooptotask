/**
 * Training record write use cases — create, update, and delete individual training records.
 *
 * `calculateExpirationDate(completionDate, expirationMonths)` is a pure utility exported
 * for reuse in the batch import path (`trainingRecordsBatch.ts`) and training reports.
 *
 * For bulk CSV import, see `trainingRecordsBatch.ts`.
 * For read-side reporting, see `trainingReportsQuery.ts` and `trainingSummaryQuery.ts`.
 */
import { fail } from '$lib/server/core/errors';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG, type PolicyResource } from '$lib/access/policyEvaluator';
import { formatDate, parseDate } from '$lib/utils/dates';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';
import type { WritePorts } from '$lib/server/core/ports';
import { policyResourceForPersonnel, requireFeaturePolicy } from './featurePolicy';

const entity = PersonnelTrainingEntity;
const AUDIT_RESOURCE = 'training_record';

export function calculateExpirationDate(completionDate: string | null, expirationMonths: number | null): string | null {
	if (expirationMonths === null || !completionDate) return null;
	const date = parseDate(completionDate);
	date.setMonth(date.getMonth() + expirationMonths);
	return formatDate(date);
}

interface TrainingTypeRow {
	expiration_months: number | null;
	expiration_date_only: boolean;
}

interface TrainingRecordResourceRow {
	personnel_id: string;
}

function canHardDeleteTrainingRecord(ctx: WritePorts, resource: PolicyResource): boolean {
	return evaluatePolicyDecision({
		decisionKind: 'server-authoritative',
		actor: { membershipRole: ctx.auth.role },
		action: POLICY_ACTION_CATALOG.training.configureRequirements,
		capabilityMap: ctx.auth.capabilityMap,
		scopeSet: ctx.auth.scopeSet,
		resource,
		overlays: []
	}).allowed;
}

async function policyResourceForTrainingRecord(ctx: WritePorts, recordId: string): Promise<PolicyResource> {
	const record = await ctx.store.findOne<TrainingRecordResourceRow>(
		entity.table,
		ctx.auth.orgId,
		{ id: recordId },
		'personnel_id'
	);
	if (!record?.personnel_id) {
		return { kind: 'organization' };
	}
	return policyResourceForPersonnel(ctx, record.personnel_id);
}

export async function createTrainingRecord(ctx: WritePorts, input: Record<string, unknown>): Promise<unknown> {
	const validated = entity.createSchema.parse(input) as Record<string, unknown>;
	const personnelId = validated.personnelId as string;
	const trainingTypeId = validated.trainingTypeId as string;
	const completionDate = (validated.completionDate as string | null) ?? null;

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.training.recordCompletions,
		await policyResourceForPersonnel(ctx, personnelId),
		AUDIT_RESOURCE
	);

	const trainingType = await ctx.store.findOne<TrainingTypeRow>(
		'training_types',
		ctx.auth.orgId,
		{ id: trainingTypeId },
		'expiration_months, expiration_date_only'
	);

	if (!trainingType) fail(404, 'Training type not found');

	const isExpirationDateOnly = trainingType.expiration_date_only ?? false;

	const expirationDate = isExpirationDateOnly
		? (input.expirationDate as string)
		: calculateExpirationDate(completionDate, trainingType.expiration_months);

	// Upsert: check for existing record with same personnel + type
	const existing = await ctx.store.findOne<{ id: string }>(entity.table, ctx.auth.orgId, {
		personnel_id: personnelId,
		training_type_id: trainingTypeId
	});

	let row: Record<string, unknown>;
	if (existing) {
		row = await ctx.store.update<Record<string, unknown>>(entity.table, ctx.auth.orgId, existing.id, {
			completion_date: completionDate ?? null,
			expiration_date: expirationDate ?? null,
			notes: validated.notes ?? null,
			certificate_url: validated.certificateUrl ?? null,
			updated_at: new Date().toISOString()
		});
	} else {
		const dbData = entity.toDbInsert(validated, ctx.auth.orgId);
		dbData.expiration_date = expirationDate ?? null;
		row = await ctx.store.insert<Record<string, unknown>>(entity.table, ctx.auth.orgId, dbData);
	}

	ctx.audit.log({
		action: existing ? `${AUDIT_RESOURCE}.updated` : `${AUDIT_RESOURCE}.created`,
		resourceType: AUDIT_RESOURCE,
		resourceId: row.id as string | undefined
	});

	return entity.fromDb(row);
}

export async function updateTrainingRecord(ctx: WritePorts, input: Record<string, unknown>): Promise<unknown> {
	const { id, ...fields } = input;
	if (!id || typeof id !== 'string') {
		fail(400, 'Missing id');
	}

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.training.recordCompletions,
		await policyResourceForTrainingRecord(ctx, id),
		AUDIT_RESOURCE,
		id
	);

	const existing = await ctx.store.findOne<{
		training_type_id: string;
		personnel_id: string;
	}>('personnel_trainings', ctx.auth.orgId, { id });

	let isExpirationDateOnly = false;
	let expirationMonths: number | null = null;

	if (existing) {
		const trainingType = await ctx.store.findOne<{
			expiration_months: number | null;
			expiration_date_only: boolean | null;
		}>('training_types', ctx.auth.orgId, { id: existing.training_type_id });

		if (trainingType) {
			isExpirationDateOnly = trainingType.expiration_date_only ?? false;
			expirationMonths = trainingType.expiration_months;
		}
	}

	const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

	if (fields.completionDate !== undefined) {
		updates.completion_date = fields.completionDate;
	}

	if (isExpirationDateOnly) {
		if (fields.expirationDate !== undefined) {
			updates.expiration_date = fields.expirationDate;
		}
	} else if (fields.completionDate !== undefined) {
		updates.expiration_date = calculateExpirationDate(fields.completionDate as string, expirationMonths);
	}

	if (fields.notes !== undefined) updates.notes = fields.notes;
	if (fields.certificateUrl !== undefined) updates.certificate_url = fields.certificateUrl;

	const row = await ctx.store.update<Record<string, unknown>>('personnel_trainings', ctx.auth.orgId, id, updates);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.updated`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id,
		details: {
			personnel_id: row.personnel_id,
			training_type_id: row.training_type_id,
			completion_date: row.completion_date
		}
	});

	return entity.fromDb(row);
}

export async function deleteTrainingRecord(ctx: WritePorts, id: string): Promise<{ requiresApproval: boolean } | void> {
	const resource = await policyResourceForTrainingRecord(ctx, id);
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.training.recordCompletions, resource, AUDIT_RESOURCE, id);

	if (!canHardDeleteTrainingRecord(ctx, resource)) {
		return { requiresApproval: true };
	}

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) fail(403, 'Organization is in read-only mode');

	await ctx.store.delete(entity.table, ctx.auth.orgId, id);

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.deleted`,
		resourceType: AUDIT_RESOURCE,
		resourceId: id
	});
}

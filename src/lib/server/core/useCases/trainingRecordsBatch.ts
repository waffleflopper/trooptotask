import { fail } from '$lib/server/core/errors';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';
import { calculateExpirationDate } from './trainingRecords';
import type { UseCaseContext } from '$lib/server/core/ports';

const entity = PersonnelTrainingEntity;
const AUDIT_RESOURCE = 'training_record';
const MAX_BATCH_SIZE = 500;

interface BatchTrainingRecord {
	personnelId: string;
	trainingTypeId: string;
	completionDate: string | null;
	notes?: string;
	status: 'completed' | 'exempt';
}

interface ImportTrainingRecordsInput {
	records: BatchTrainingRecord[];
}

interface BatchError {
	index: number;
	message: string;
}

interface BatchImportResult {
	inserted: unknown[];
	updated: unknown[];
	exempted: Array<{ index: number; personnelId: string; trainingTypeId: string }>;
	errors: BatchError[];
}

export async function importTrainingRecords(
	ctx: UseCaseContext,
	input: ImportTrainingRecordsInput
): Promise<BatchImportResult> {
	ctx.auth.requireEdit('training');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) fail(403, 'Organization is in read-only mode');

	const { records } = input;

	if (!Array.isArray(records) || records.length === 0) {
		fail(400, 'records array is required');
	}

	if (records.length > MAX_BATCH_SIZE) {
		fail(400, `Maximum ${MAX_BATCH_SIZE} records per batch`);
	}

	// Enforce group scope in one batch call
	const uniquePersonnelIds = [...new Set(records.map((r) => r.personnelId))];
	await ctx.auth.requireGroupAccessBatch(uniquePersonnelIds);

	// Prefetch training types in single query
	const trainingTypeIds = [...new Set(records.map((r) => r.trainingTypeId))];
	const trainingTypes = await ctx.store.findMany<{
		id: string;
		expiration_months: number | null;
		expiration_date_only: boolean;
		can_be_exempted: boolean;
		exempt_personnel_ids: string[];
	}>('training_types', ctx.auth.orgId, undefined, {
		inFilters: { id: trainingTypeIds },
		select: 'id, expiration_months, expiration_date_only, can_be_exempted, exempt_personnel_ids'
	});
	const typeMap = new Map(trainingTypes.map((t) => [t.id, t]));

	// Prefetch existing records for upsert detection
	const personnelIds = [...new Set(records.map((r) => r.personnelId))];
	const existingRecords = await ctx.store.findMany<{
		id: string;
		personnel_id: string;
		training_type_id: string;
	}>(entity.table, ctx.auth.orgId, undefined, {
		inFilters: { personnel_id: personnelIds, training_type_id: trainingTypeIds }
	});
	const existingMap = new Map(existingRecords.map((e) => [`${e.personnel_id}:${e.training_type_id}`, e.id]));

	const batchErrors: BatchError[] = [];
	const insertRows: Array<{ index: number; row: Record<string, unknown> }> = [];
	const updateRows: Array<{ index: number; id: string; row: Record<string, unknown> }> = [];
	const exemptionUpdates: Map<string, Set<string>> = new Map();

	for (let i = 0; i < records.length; i++) {
		const rec = records[i];
		const type = typeMap.get(rec.trainingTypeId);

		if (!type) {
			batchErrors.push({ index: i, message: 'Training type not found' });
			continue;
		}

		if (rec.status === 'exempt') {
			if (!type.can_be_exempted) {
				batchErrors.push({ index: i, message: 'This training type does not allow exemptions' });
				continue;
			}
			if (!exemptionUpdates.has(rec.trainingTypeId)) {
				exemptionUpdates.set(rec.trainingTypeId, new Set(type.exempt_personnel_ids ?? []));
			}
			exemptionUpdates.get(rec.trainingTypeId)!.add(rec.personnelId);
			continue;
		}

		const completionDate = rec.completionDate;
		const isExpirationDateOnly = type.expiration_date_only ?? false;

		if (isExpirationDateOnly && !completionDate) {
			batchErrors.push({ index: i, message: 'Expiration date required for this training type' });
			continue;
		}

		if (type.expiration_months !== null && !completionDate) {
			batchErrors.push({ index: i, message: 'Completion date is required for training that expires' });
			continue;
		}

		const expirationDate = isExpirationDateOnly
			? completionDate
			: calculateExpirationDate(completionDate, type.expiration_months);

		const existingId = existingMap.get(`${rec.personnelId}:${rec.trainingTypeId}`);

		if (existingId) {
			updateRows.push({
				index: i,
				id: existingId,
				row: {
					completion_date: completionDate,
					expiration_date: expirationDate,
					notes: rec.notes ?? null,
					updated_at: new Date().toISOString()
				}
			});
		} else {
			insertRows.push({
				index: i,
				row: {
					organization_id: ctx.auth.orgId,
					personnel_id: rec.personnelId,
					training_type_id: rec.trainingTypeId,
					completion_date: completionDate,
					expiration_date: expirationDate,
					notes: rec.notes ?? null
				}
			});
		}
	}

	// Bulk insert
	let insertedData: Record<string, unknown>[] = [];
	if (insertRows.length > 0) {
		insertedData = await ctx.store.insertMany<Record<string, unknown>>(
			entity.table,
			ctx.auth.orgId,
			insertRows.map((r) => r.row)
		);
	}

	// Individual updates
	const updatedData: Record<string, unknown>[] = [];
	for (const rec of updateRows) {
		const updated = await ctx.store.update<Record<string, unknown>>(entity.table, ctx.auth.orgId, rec.id, rec.row);
		updatedData.push(updated);
	}

	// Persist exemption updates
	for (const [typeId, personnelIds] of exemptionUpdates) {
		const typeRecord = await ctx.store.findOne<{ id: string }>('training_types', ctx.auth.orgId, { id: typeId });
		if (typeRecord) {
			await ctx.store.update('training_types', ctx.auth.orgId, typeId, {
				exempt_personnel_ids: [...personnelIds]
			});
		}
	}

	// Build exempted results
	const exemptedResults: Array<{ index: number; personnelId: string; trainingTypeId: string }> = [];
	for (let i = 0; i < records.length; i++) {
		if (records[i].status === 'exempt' && !batchErrors.some((e) => e.index === i)) {
			exemptedResults.push({
				index: i,
				personnelId: records[i].personnelId,
				trainingTypeId: records[i].trainingTypeId
			});
		}
	}

	ctx.audit.log({
		action: 'training.bulk_imported',
		resourceType: AUDIT_RESOURCE,
		details: {
			inserted: insertedData.length,
			updated: updatedData.length,
			exempted: exemptedResults.length
		}
	});

	return {
		inserted: insertedData.map((row) => entity.fromDb(row)),
		updated: updatedData.map((row) => entity.fromDb(row)),
		exempted: exemptedResults,
		errors: batchErrors
	};
}

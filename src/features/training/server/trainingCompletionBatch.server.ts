import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourcesForTrainingPersonnel } from './trainingCompletionOperations.server';
import { calculateExpirationDate } from '../utils/trainingStatus';
import type { TrainingBatchContext } from './trainingCompletionPorts.server';
import type {
	TrainingBatchImportInput,
	TrainingBatchImportResult,
	TrainingCompletedUpsert,
	SavedTrainingCompletion
} from '../contracts';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { fail } from '$lib/errors';
import { isDateOnly } from '$lib/utils/dates';
import { DATE_ONLY_MESSAGE, isUuid } from '$lib/utils/inputSchemas';
import { TRAINING_TYPE_UNAVAILABLE_MESSAGE } from './trainingPersistenceMapping.server';

const AUDIT_RESOURCE = 'training_record';
const MAX_BATCH_SIZE = 500;

export async function importTrainingRecords(
	ctx: TrainingBatchContext,
	input: TrainingBatchImportInput
): Promise<TrainingBatchImportResult> {
	const { records } = input;

	if (!Array.isArray(records) || records.length === 0) {
		fail(400, 'records array is required');
	}

	if (records.length > MAX_BATCH_SIZE) {
		fail(400, `Maximum ${MAX_BATCH_SIZE} records per batch`);
	}

	if (records.some((record) => !isUuid(record?.personnelId) || !isUuid(record?.trainingTypeId))) {
		fail(400, 'Each record must name a Person and Training type by ID');
	}

	const uniquePersonnelIds = [...new Set(records.map((r) => r.personnelId))];
	const personnelResources = await policyResourcesForTrainingPersonnel(ctx, uniquePersonnelIds);
	for (const personnelId of uniquePersonnelIds) {
		await requireFeaturePolicy(
			ctx,
			POLICY_ACTION_CATALOG.training.recordCompletions,
			personnelResources.get(personnelId) ?? { kind: 'organization' },
			AUDIT_RESOURCE,
			personnelId
		);
	}

	const exemptTrainingTypeIds = [...new Set(records.filter((r) => r.status === 'exempt').map((r) => r.trainingTypeId))];
	for (const trainingTypeId of exemptTrainingTypeIds) {
		await requireFeaturePolicy(
			ctx,
			POLICY_ACTION_CATALOG.training.configureRequirements,
			{ kind: 'organization' },
			'training_type',
			trainingTypeId
		);
	}

	const trainingTypeIds = [...new Set(records.map((r) => r.trainingTypeId))];
	const trainingTypes = await ctx.trainingCatalog.listTypeImportReferences(trainingTypeIds);
	const typeMap = new Map(trainingTypes.map((t) => [t.id, t]));

	const personnelIds = [...new Set(records.map((r) => r.personnelId))];
	const existingRecords = await ctx.trainingCompletions.listPairReferences(personnelIds, trainingTypeIds);
	const existingMap = new Map(existingRecords.map((e) => [`${e.personnelId}:${e.trainingTypeId}`, e.id]));

	const batchErrors: TrainingBatchImportResult['errors'] = [];
	const completedRows: TrainingCompletedUpsert[] = [];
	const exemptionUpdates: Map<string, Set<string>> = new Map();

	for (let i = 0; i < records.length; i++) {
		const rec = records[i];
		const type = typeMap.get(rec.trainingTypeId);

		if (!type) {
			batchErrors.push({ index: i, message: 'Training type not found' });
			continue;
		}

		if (rec.status === 'exempt') {
			if (!type.canBeExempted) {
				batchErrors.push({ index: i, message: 'This training type does not allow exemptions' });
				continue;
			}
			if (!exemptionUpdates.has(rec.trainingTypeId)) {
				exemptionUpdates.set(rec.trainingTypeId, new Set(type.exemptPersonnelIds ?? []));
			}
			exemptionUpdates.get(rec.trainingTypeId)!.add(rec.personnelId);
			continue;
		}

		const completionDate = rec.completionDate;
		if (
			completionDate !== undefined &&
			completionDate !== null &&
			completionDate !== '' &&
			!isDateOnly(completionDate)
		) {
			batchErrors.push({ index: i, message: DATE_ONLY_MESSAGE });
			continue;
		}
		const isExpirationDateOnly = type.expirationDateOnly ?? false;

		if (isExpirationDateOnly && !completionDate) {
			batchErrors.push({ index: i, message: 'Expiration date required for this training type' });
			continue;
		}

		if (type.expirationMonths !== null && !completionDate) {
			batchErrors.push({ index: i, message: 'Completion date is required for training that expires' });
			continue;
		}

		const expirationDate = isExpirationDateOnly
			? completionDate
			: calculateExpirationDate(completionDate, type.expirationMonths);

		completedRows.push({
			personnelId: rec.personnelId,
			trainingTypeId: rec.trainingTypeId,
			completionDate: completionDate,
			expirationDate: expirationDate,
			notes: rec.notes ?? null,
			updatedAt: new Date().toISOString()
		});
	}

	const insertedData: SavedTrainingCompletion[] = [];
	const updatedData: SavedTrainingCompletion[] = [];
	if (completedRows.length > 0) {
		const dedupedCompletedRows = [
			...new Map(completedRows.map((row) => [`${row.personnelId}:${row.trainingTypeId}`, row] as const)).values()
		];
		const upsertedData = await ctx.trainingCompletions.upsertCompleted(dedupedCompletedRows);

		for (const row of upsertedData) {
			const key = `${row.personnelId}:${row.trainingTypeId}`;
			if (existingMap.has(key)) {
				updatedData.push(row);
			} else {
				insertedData.push(row);
			}
		}
	}

	const unavailableTypeIds = new Set<string>();
	for (const [typeId, personnelIds] of exemptionUpdates) {
		const saved =
			(await ctx.trainingCatalog.findTypeId(typeId)) &&
			(await ctx.trainingCatalog.patchType(typeId, { exemptPersonnelIds: [...personnelIds] }));
		if (!saved) unavailableTypeIds.add(typeId);
	}
	records.forEach((record, index) => {
		if (record.status === 'exempt' && unavailableTypeIds.has(record.trainingTypeId)) {
			batchErrors.push({ index, message: TRAINING_TYPE_UNAVAILABLE_MESSAGE });
		}
	});

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
		inserted: insertedData,
		updated: updatedData,
		exempted: exemptedResults,
		errors: batchErrors
	};
}

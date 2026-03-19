import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import { auditLog } from '$lib/server/auditLog';
import { formatDate } from '$lib/utils/dates';

function calculateExpirationDate(completionDate: string | null, expirationMonths: number | null): string | null {
	if (expirationMonths === null || !completionDate) return null;
	const date = new Date(completionDate);
	date.setMonth(date.getMonth() + expirationMonths);
	return formatDate(date);
}

interface BatchTrainingRecord {
	personnelId: string;
	trainingTypeId: string;
	completionDate: string | null;
	notes?: string;
	status: 'completed' | 'exempt';
}

export const POST = apiRoute({ permission: { edit: 'training' } }, async ({ supabase, orgId, userId, ctx }, event) => {
	const body = await event.request.json();
	const records: BatchTrainingRecord[] = body.records;

	if (!Array.isArray(records) || records.length === 0) {
		throw error(400, 'records array is required');
	}

	if (records.length > 500) {
		throw error(400, 'Maximum 500 records per batch');
	}

	// Get scoped group for validation
	const scopedGroupId = ctx?.scopedGroupId ?? null;

	// Fetch all referenced training types in one query
	const trainingTypeIds = [...new Set(records.map((r) => r.trainingTypeId))];
	const { data: trainingTypes } = await supabase
		.from('training_types')
		.select('id, expiration_months, expiration_date_only, can_be_exempted, exempt_personnel_ids')
		.eq('organization_id', orgId)
		.in('id', trainingTypeIds);
	const typeMap = new Map((trainingTypes ?? []).map((t) => [t.id, t]));

	// If scoped, fetch personnel group_ids for access check
	let personnelGroupMap = new Map<string, string | null>();
	if (scopedGroupId) {
		const personnelIds = [...new Set(records.map((r) => r.personnelId))];
		const { data: personnelData } = await supabase
			.from('personnel')
			.select('id, group_id')
			.eq('organization_id', orgId)
			.in('id', personnelIds)
			.is('archived_at', null);
		personnelGroupMap = new Map((personnelData ?? []).map((p) => [p.id, p.group_id]));
	}

	// Split and validate
	const completedRecords: Array<{ index: number; row: Record<string, unknown>; isUpdate: boolean }> = [];
	const exemptionUpdates: Map<string, Set<string>> = new Map();
	const batchErrors: Array<{ index: number; message: string }> = [];

	// Fetch existing training records for upsert detection — scope to referenced IDs only
	const personnelIdsForLookup = [...new Set(records.map((r) => r.personnelId))];
	const { data: existingRecords } = await supabase
		.from('personnel_trainings')
		.select('id, personnel_id, training_type_id')
		.eq('organization_id', orgId)
		.in('personnel_id', personnelIdsForLookup)
		.in('training_type_id', trainingTypeIds);
	const existingMap = new Map((existingRecords ?? []).map((e) => [`${e.personnel_id}:${e.training_type_id}`, e.id]));

	for (let i = 0; i < records.length; i++) {
		const rec = records[i];
		const type = typeMap.get(rec.trainingTypeId);

		if (!type) {
			batchErrors.push({ index: i, message: 'Training type not found' });
			continue;
		}

		if (scopedGroupId) {
			const groupId = personnelGroupMap.get(rec.personnelId);
			if (groupId !== scopedGroupId) {
				batchErrors.push({ index: i, message: 'Personnel not in your assigned group' });
				continue;
			}
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
			completedRecords.push({
				index: i,
				isUpdate: true,
				row: {
					id: existingId,
					completion_date: completionDate,
					expiration_date: expirationDate,
					notes: rec.notes ?? null,
					updated_at: new Date().toISOString()
				}
			});
		} else {
			completedRecords.push({
				index: i,
				isUpdate: false,
				row: {
					organization_id: orgId,
					personnel_id: rec.personnelId,
					training_type_id: rec.trainingTypeId,
					completion_date: completionDate,
					expiration_date: expirationDate,
					notes: rec.notes ?? null
				}
			});
		}
	}

	const insertRows = completedRecords.filter((r) => !r.isUpdate);
	const updateRows = completedRecords.filter((r) => r.isUpdate);

	let insertedData: Record<string, unknown>[] = [];
	const updatedData: Record<string, unknown>[] = [];
	const exemptedResults: Array<{ index: number; personnelId: string; trainingTypeId: string }> = [];

	if (insertRows.length > 0) {
		const { data, error: insertError } = await supabase
			.from('personnel_trainings')
			.insert(insertRows.map((r) => r.row))
			.select();

		if (insertError) throw error(500, insertError.message);
		insertedData = data ?? [];
	}

	const updateResults = await Promise.all(
		updateRows.map(async (rec) => {
			const { id, ...updates } = rec.row as { id: string; [key: string]: unknown };
			const { data, error: updateError } = await supabase
				.from('personnel_trainings')
				.update(updates)
				.eq('id', id)
				.eq('organization_id', orgId)
				.select()
				.single();
			return { rec, data, updateError };
		})
	);

	for (const { rec, data, updateError } of updateResults) {
		if (updateError) {
			batchErrors.push({ index: rec.index, message: updateError.message });
		} else if (data) {
			updatedData.push(data);
		}
	}

	for (const [typeId, personnelIds] of exemptionUpdates) {
		const { error: exemptError } = await supabase
			.from('training_types')
			.update({ exempt_personnel_ids: [...personnelIds] })
			.eq('id', typeId)
			.eq('organization_id', orgId);

		if (exemptError) {
			batchErrors.push({ index: -1, message: `Failed to update exemptions: ${exemptError.message}` });
		}
	}

	for (let i = 0; i < records.length; i++) {
		if (records[i].status === 'exempt' && !batchErrors.some((e) => e.index === i)) {
			exemptedResults.push({
				index: i,
				personnelId: records[i].personnelId,
				trainingTypeId: records[i].trainingTypeId
			});
		}
	}

	const transformRecord = (d: Record<string, unknown>) => ({
		id: d.id,
		personnelId: d.personnel_id,
		trainingTypeId: d.training_type_id,
		completionDate: d.completion_date,
		expirationDate: d.expiration_date,
		notes: d.notes,
		certificateUrl: d.certificate_url
	});

	auditLog(
		{
			action: 'training.bulk_imported',
			resourceType: 'training_record',
			orgId,
			details: {
				actor: event.locals.user?.email ?? userId,
				inserted: insertedData.length,
				updated: updatedData.length,
				exempted: exemptedResults.length
			}
		},
		{ userId }
	);

	return json({
		inserted: insertedData.map(transformRecord),
		updated: updatedData.map(transformRecord),
		exempted: exemptedResults,
		errors: batchErrors
	});
});

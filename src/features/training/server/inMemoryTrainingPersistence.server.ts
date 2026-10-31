import { fail } from '$lib/errors';
import type { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
type TrainingMemoryStore = Pick<
	ReturnType<typeof createInMemoryDataStore>,
	'findOne' | 'findMany' | 'insert' | 'update' | 'delete' | 'upsertMany'
>;
import type { StoragePort } from '$lib/storage/contracts';
import type { TrainingCatalogPersistence, TrainingCompletionPersistence } from '../contracts';
import type { TrainingCertificateStore } from './trainingCompletionPorts.server';
import { TRAINING_CERTIFICATE_BUCKET } from './trainingCertificateStore.server';
import {
	TRAINING_TYPE_NAME_EXISTS_MESSAGE,
	TRAINING_TYPE_ORDER_CHANGED_MESSAGE,
	TRAINING_TYPE_ORDER_INVALID_MESSAGE,
	toTrainingType,
	toTrainingView,
	toTrainingCompletion,
	toWorkspaceTrainingCompletion,
	toTrainingCompletionFacts,
	TRAINING_WORKSPACE_COMPLETION_FIELDS,
	TRAINING_READINESS_COMPLETION_FIELDS,
	type TrainingCompletionReadRow,
	toTrainingCompletionEntryResource,
	toTrainingCompletionHistoryEntry,
	TRAINING_COMPLETION_ENTRY_FIELDS,
	TRAINING_COMPLETION_TABLES,
	trainingTypeCreateRow,
	trainingTypePatchRow,
	trainingViewCreateRow,
	trainingViewPatchRow,
	trainingCompletionCreateRow,
	trainingCompletionPatchRow,
	trainingCompletedRow,
	type TrainingTypeRow,
	type TrainingViewRow,
	type TrainingCompletionRow,
	type TrainingCompletionEntryRow,
	type TrainingCompletionHistoryRow
} from './trainingPersistenceMapping.server';

export function createInMemoryTrainingCatalogPersistence(
	store: TrainingMemoryStore,
	orgId: string
): TrainingCatalogPersistence {
	return {
		async listTypes() {
			return (
				await store.findMany<TrainingTypeRow>('training_types', orgId, undefined, {
					orderBy: [
						{ column: 'sort_order', ascending: true },
						{ column: 'id', ascending: true }
					]
				})
			).map(toTrainingType);
		},
		async listViews() {
			return (
				await store.findMany<TrainingViewRow>('training_views', orgId, undefined, {
					orderBy: [{ column: 'name', ascending: true }]
				})
			).map(toTrainingView);
		},
		async listTypeLabels() {
			return (
				await store.findMany<{ id: string; name: string }>('training_types', orgId, {}, { select: 'id, name' })
			).map(({ id, name }) => ({ id, name }));
		},
		async listRankApplicabilityReferences() {
			return (
				await store.findMany<{ applies_to_ranks?: unknown; excluded_ranks?: unknown }>(
					'training_types',
					orgId,
					undefined,
					{ select: 'applies_to_ranks, excluded_ranks' }
				)
			).map((row) => ({ appliesToRanks: row.applies_to_ranks, excludedRanks: row.excluded_ranks }));
		},
		async findTypeByName(name) {
			const row = await store.findOne<TrainingTypeRow>('training_types', orgId, { name });
			return row ? toTrainingType(row) : null;
		},
		async findTypeTiming(id) {
			const row = await store.findOne<{ expiration_months: number | null; expiration_date_only: boolean | null }>(
				'training_types',
				orgId,
				{ id },
				'expiration_months, expiration_date_only'
			);
			return row ? { expirationMonths: row.expiration_months, expirationDateOnly: row.expiration_date_only } : null;
		},
		async listTypeImportReferences(ids) {
			return (
				await store.findMany<{
					id: string;
					expiration_months: number | null;
					expiration_date_only: boolean | null;
					can_be_exempted: boolean | null;
					exempt_personnel_ids: string[] | null;
				}>('training_types', orgId, undefined, {
					inFilters: { id: [...ids] },
					select: 'id, expiration_months, expiration_date_only, can_be_exempted, exempt_personnel_ids'
				})
			).map((row) => ({
				id: row.id,
				expirationMonths: row.expiration_months,
				expirationDateOnly: row.expiration_date_only,
				canBeExempted: row.can_be_exempted,
				exemptPersonnelIds: row.exempt_personnel_ids
			}));
		},
		findTypeId(id) {
			return store.findOne('training_types', orgId, { id }, 'id');
		},
		async setPersonExemption(typeId, personnelId, exempt) {
			const type = await store.findOne<{ can_be_exempted: boolean | null; exempt_personnel_ids: string[] | null }>(
				'training_types',
				orgId,
				{ id: typeId },
				'can_be_exempted, exempt_personnel_ids'
			);
			if (!type) fail(404, 'This Training type is no longer available');
			if (!(await store.findOne('personnel', orgId, { id: personnelId }))) fail(404, 'Personnel not found');
			if (exempt && !type.can_be_exempted) fail(409, 'This Training type does not allow exemptions');
			const ids = type.exempt_personnel_ids ?? [];
			if (ids.includes(personnelId) === exempt) return;
			await store.update('training_types', orgId, typeId, {
				exempt_personnel_ids: exempt ? [...ids, personnelId] : ids.filter((id) => id !== personnelId)
			});
		},
		async createType(input) {
			if (await store.findOne('training_types', orgId, { name: input.name }))
				fail(409, TRAINING_TYPE_NAME_EXISTS_MESSAGE);
			return toTrainingType(
				await store.insert<TrainingTypeRow>('training_types', orgId, trainingTypeCreateRow(input, orgId))
			);
		},
		async patchType(id, fields) {
			if (!(await store.findOne('training_types', orgId, { id }))) return null;
			return toTrainingType(
				await store.update<TrainingTypeRow>('training_types', orgId, id, defined(trainingTypePatchRow(fields)))
			);
		},
		deleteType(id) {
			return store.delete('training_types', orgId, id);
		},
		async setTypeOrder(ids, expectedIds) {
			const saved = (
				await store.findMany<TrainingTypeRow>('training_types', orgId, undefined, {
					orderBy: [
						{ column: 'sort_order', ascending: true },
						{ column: 'id', ascending: true }
					]
				})
			).map((row) => toTrainingType(row).id);
			if (saved.length === ids.length && saved.every((id, index) => id === ids[index])) return;
			if (saved.length !== expectedIds.length || saved.some((id, index) => id !== expectedIds[index]))
				fail(409, TRAINING_TYPE_ORDER_CHANGED_MESSAGE);
			if (ids.length !== saved.length || saved.some((id) => !ids.includes(id)))
				fail(400, TRAINING_TYPE_ORDER_INVALID_MESSAGE);
			for (const [position, id] of ids.entries())
				await store.update('training_types', orgId, id, { sort_order: position });
		},
		async createView(input) {
			return toTrainingView(
				await store.insert<TrainingViewRow>('training_views', orgId, trainingViewCreateRow(input, orgId))
			);
		},
		async patchView(id, fields) {
			if (!(await store.findOne('training_views', orgId, { id }))) return null;
			return toTrainingView(
				await store.update<TrainingViewRow>('training_views', orgId, id, defined(trainingViewPatchRow(fields)))
			);
		},
		deleteView(id) {
			return store.delete('training_views', orgId, id);
		}
	};
}

function defined(row: Record<string, unknown>) {
	return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

export function createInMemoryTrainingCompletionPersistence(
	store: TrainingMemoryStore,
	orgId: string
): TrainingCompletionPersistence {
	return {
		async listCompletions() {
			return (
				await store.findMany<TrainingCompletionReadRow>('personnel_trainings', orgId, undefined, {
					select: TRAINING_WORKSPACE_COMPLETION_FIELDS,
					orderBy: [{ column: 'id', ascending: true }]
				})
			).map(toWorkspaceTrainingCompletion);
		},
		async listReadinessCompletions(scope) {
			const people = new Set(scope.personnelIds);
			const types = scope.trainingTypeIds === undefined ? undefined : new Set(scope.trainingTypeIds);
			return (
				await store.findMany<TrainingCompletionReadRow>('personnel_trainings', orgId, undefined, {
					select: TRAINING_READINESS_COMPLETION_FIELDS,
					orderBy: [{ column: 'id', ascending: true }]
				})
			)
				.filter((row) => people.has(row.personnel_id) && (!types || types.has(row.training_type_id)))
				.map(toTrainingCompletionFacts);
		},
		async findResource(id) {
			const row = await store.findOne<{ personnel_id: string; training_type_id: string }>(
				'personnel_trainings',
				orgId,
				{ id },
				'personnel_id, training_type_id'
			);
			return row ? { personnelId: row.personnel_id, trainingTypeId: row.training_type_id } : null;
		},
		async findPair(personnelId, trainingTypeId) {
			const row = await store.findOne<{ id: string; completion_date: string | null; expiration_date: string | null }>(
				'personnel_trainings',
				orgId,
				{ personnel_id: personnelId, training_type_id: trainingTypeId },
				'id, completion_date, expiration_date'
			);
			return row ? { id: row.id, completionDate: row.completion_date, expirationDate: row.expiration_date } : null;
		},
		async listPairReferences(personnelIds, trainingTypeIds) {
			return (
				await store.findMany<{ id: string; personnel_id: string; training_type_id: string }>(
					'personnel_trainings',
					orgId,
					undefined,
					{
						inFilters: { personnel_id: [...personnelIds], training_type_id: [...trainingTypeIds] },
						select: 'id, personnel_id, training_type_id'
					}
				)
			).map((row) => ({ id: row.id, personnelId: row.personnel_id, trainingTypeId: row.training_type_id }));
		},
		async listPersonExportFacts(personnelId) {
			return (
				await store.findMany<{
					training_type_id: string;
					completion_date: string | null;
					expiration_date: string | null;
					notes: string | null;
				}>(
					'personnel_trainings',
					orgId,
					{ personnel_id: personnelId },
					{ select: 'training_type_id, completion_date, expiration_date, notes' }
				)
			).map((row) => ({
				trainingTypeId: row.training_type_id,
				completionDate: row.completion_date,
				expirationDate: row.expiration_date,
				notes: row.notes
			}));
		},
		async listPersonCompletions(personnelId) {
			return (
				await store.findMany<TrainingCompletionRow>('personnel_trainings', orgId, { personnel_id: personnelId })
			).map(toTrainingCompletion);
		},
		async listPersonHistory(personnelId) {
			return (
				await store.findMany<TrainingCompletionHistoryRow>('personnel_training_history', orgId, {
					personnel_id: personnelId
				})
			).map(toTrainingCompletionHistoryEntry);
		},
		async findEntry(kind, id) {
			const row = await store.findOne<TrainingCompletionEntryRow>(
				TRAINING_COMPLETION_TABLES[kind],
				orgId,
				{ id },
				TRAINING_COMPLETION_ENTRY_FIELDS
			);
			return row ? toTrainingCompletionEntryResource(row) : null;
		},
		async correctEntry(kind, id, fields) {
			const table = TRAINING_COMPLETION_TABLES[kind];
			if (!(await store.findOne(table, orgId, { id }))) return null;
			const row = await store.update<TrainingCompletionRow & TrainingCompletionHistoryRow>(table, orgId, id, {
				completion_date: fields.completionDate,
				expiration_date: fields.expirationDate,
				notes: fields.notes
			});
			return kind === 'current' ? toTrainingCompletion(row) : toTrainingCompletionHistoryEntry(row);
		},
		async createRecord(input) {
			return toTrainingCompletion(
				await store.insert<TrainingCompletionRow>(
					'personnel_trainings',
					orgId,
					trainingCompletionCreateRow(input, orgId)
				)
			);
		},
		async patchRecord(id, fields) {
			return toTrainingCompletion(
				await store.update<TrainingCompletionRow>(
					'personnel_trainings',
					orgId,
					id,
					defined(trainingCompletionPatchRow(fields))
				)
			);
		},
		deleteRecord(id) {
			return store.delete('personnel_trainings', orgId, id);
		},
		async upsertCompleted(rows) {
			return (
				await store.upsertMany<TrainingCompletionRow>(
					'personnel_trainings',
					orgId,
					rows.map((row) => defined(trainingCompletedRow(row, orgId))),
					{ onConflict: 'organization_id,personnel_id,training_type_id' }
				)
			).map(toTrainingCompletion);
		}
	};
}

export function createInMemoryTrainingCertificateStore(
	store: TrainingMemoryStore,
	storage: StoragePort,
	orgId: string
): TrainingCertificateStore {
	return {
		async upload(_personnelId, path, file) {
			await storage.upload(TRAINING_CERTIFICATE_BUCKET, path, file);
			return { async complete() {} };
		},
		async reconcile(personnelId, path) {
			const row = await store.findOne<{ id: string }>(
				'personnel_trainings',
				orgId,
				{ personnel_id: personnelId, certificate_url: path },
				'id'
			);
			if (row) return row.id;
			await storage.remove(TRAINING_CERTIFICATE_BUCKET, [path]);
			return null;
		},
		signedUrl: (path, expiresInSeconds) => storage.createSignedUrl(TRAINING_CERTIFICATE_BUCKET, path, expiresInSeconds)
	};
}

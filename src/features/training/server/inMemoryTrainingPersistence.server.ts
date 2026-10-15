import { fail } from '$lib/errors';
import type { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
type TrainingMemoryStore = Pick<
	ReturnType<typeof createInMemoryDataStore>,
	'findOne' | 'findMany' | 'findManyWithCount' | 'insert' | 'update' | 'delete' | 'upsertMany'
>;
import type { TrainingCatalogPersistence, TrainingCompletionPersistence } from '../contracts';
import {
	TRAINING_TYPE_NAME_EXISTS_MESSAGE,
	toTrainingType,
	toTrainingView,
	toTrainingCompletion,
	trainingTypeCreateRow,
	trainingTypePatchRow,
	trainingViewCreateRow,
	trainingViewPatchRow,
	trainingCompletionCreateRow,
	trainingCompletionPatchRow,
	trainingCompletedRow,
	type TrainingTypeRow,
	type TrainingViewRow,
	type TrainingCompletionRow
} from './trainingPersistenceMapping.server';

export function createInMemoryTrainingCatalogPersistence(
	store: TrainingMemoryStore,
	orgId: string
): TrainingCatalogPersistence {
	return {
		async listTypes() {
			return (
				await store.findMany<TrainingTypeRow>('training_types', orgId, undefined, {
					orderBy: [{ column: 'sort_order', ascending: true }]
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
		async countTypesEstimated() {
			return (
				(
					await store.findManyWithCount('training_types', orgId, undefined, {
						select: 'id',
						range: { from: 0, to: 0 },
						count: 'estimated'
					})
				).count ?? 0
			);
		},
		async findTypeByName(name) {
			const row = await store.findOne<TrainingTypeRow>('training_types', orgId, { name });
			return row ? toTrainingType(row) : null;
		},
		async listExistingTypeNames(names) {
			if (names.length === 0) return [];
			return (
				await store.findMany<{ name: string }>(
					'training_types',
					orgId,
					{},
					{ select: 'name', inFilters: { name: [...names] } }
				)
			).map((row) => row.name);
		},
		async hasTypes() {
			return (await store.findMany('training_types', orgId, {}, { select: 'id', limit: 1 })).length > 0;
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
			return (await store.findMany<TrainingCompletionRow>('personnel_trainings', orgId)).map(toTrainingCompletion);
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
		findPair(personnelId, trainingTypeId) {
			return store.findOne(
				'personnel_trainings',
				orgId,
				{ personnel_id: personnelId, training_type_id: trainingTypeId },
				'id'
			);
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
		async listPersonReadinessFacts(personnelId) {
			return (
				await store.findMany<{ training_type_id: string; expiration_date: string | null }>(
					'personnel_trainings',
					orgId,
					{ personnel_id: personnelId },
					{ select: 'training_type_id, expiration_date' }
				)
			).map((row) => ({ trainingTypeId: row.training_type_id, expirationDate: row.expiration_date }));
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

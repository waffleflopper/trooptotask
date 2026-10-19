import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { TrainingCompletionPersistence } from '../contracts';
import {
	TRAINING_COMPLETION_FIELDS,
	TRAINING_COMPLETION_ENTRY_FIELDS,
	TRAINING_COMPLETION_HISTORY_FIELDS,
	TRAINING_COMPLETION_TABLES,
	toTrainingCompletion,
	toTrainingCompletionEntryResource,
	toTrainingCompletionHistoryEntry,
	trainingCompletionCreateRow,
	trainingCompletionPatchRow,
	trainingCompletedRow,
	type TrainingCompletionRow,
	type TrainingCompletionEntryRow,
	type TrainingCompletionHistoryRow
} from './trainingPersistenceMapping.server';

export function createSupabaseTrainingCompletionPersistence(
	client: SupabaseClient,
	orgId: string
): TrainingCompletionPersistence {
	return {
		async listCompletions() {
			const result = await selectAllSupabaseRows<TrainingCompletionRow>(async (from, to) => {
				const { data, error } = await client
					.from('personnel_trainings')
					.select(TRAINING_COMPLETION_FIELDS)
					.eq('organization_id', orgId)
					.order('id', { ascending: true })
					.range(from, to)
					.returns<TrainingCompletionRow[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(toTrainingCompletion);
		},
		async findResource(id) {
			const { data, error } = await client
				.from('personnel_trainings')
				.select('personnel_id, training_type_id')
				.eq('organization_id', orgId)
				.eq('id', id)
				.single<{ personnel_id: string; training_type_id: string }>();
			if (error?.code === 'PGRST116') return null;
			if (error) throw new Error(error.message);
			return data ? { personnelId: data.personnel_id, trainingTypeId: data.training_type_id } : null;
		},
		async findPair(personnelId, trainingTypeId) {
			const { data, error } = await client
				.from('personnel_trainings')
				.select('id')
				.eq('organization_id', orgId)
				.eq('personnel_id', personnelId)
				.eq('training_type_id', trainingTypeId)
				.single<{ id: string }>();
			if (error?.code === 'PGRST116') return null;
			if (error) throw new Error(error.message);
			return data ? data : null;
		},
		async listPairReferences(personnelIds, trainingTypeIds) {
			const result = await selectAllSupabaseRows<{ id: string; personnel_id: string; training_type_id: string }>(
				async (from, to) => {
					const { data, error } = await client
						.from('personnel_trainings')
						.select('id, personnel_id, training_type_id')
						.eq('organization_id', orgId)
						.in('personnel_id', [...personnelIds])
						.in('training_type_id', [...trainingTypeIds])
						.order('id', { ascending: true })
						.range(from, to)
						.returns<{ id: string; personnel_id: string; training_type_id: string }[]>();
					return { data, error };
				}
			);
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map((row) => ({
				id: row.id,
				personnelId: row.personnel_id,
				trainingTypeId: row.training_type_id
			}));
		},
		async listPersonReadinessFacts(personnelId) {
			const result = await selectAllSupabaseRows<{ training_type_id: string; expiration_date: string | null }>(
				async (from, to) => {
					const { data, error } = await client
						.from('personnel_trainings')
						.select('training_type_id, expiration_date')
						.eq('organization_id', orgId)
						.eq('personnel_id', personnelId)
						.order('id', { ascending: true })
						.range(from, to)
						.returns<{ training_type_id: string; expiration_date: string | null }[]>();
					return { data, error };
				}
			);
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map((row) => ({
				trainingTypeId: row.training_type_id,
				expirationDate: row.expiration_date
			}));
		},
		async listPersonExportFacts(personnelId) {
			const result = await selectAllSupabaseRows<{
				training_type_id: string;
				completion_date: string | null;
				expiration_date: string | null;
				notes: string | null;
			}>(async (from, to) => {
				const { data, error } = await client
					.from('personnel_trainings')
					.select('training_type_id, completion_date, expiration_date, notes')
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId)
					.order('id', { ascending: true })
					.range(from, to)
					.returns<
						{
							training_type_id: string;
							completion_date: string | null;
							expiration_date: string | null;
							notes: string | null;
						}[]
					>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map((row) => ({
				trainingTypeId: row.training_type_id,
				completionDate: row.completion_date,
				expirationDate: row.expiration_date,
				notes: row.notes
			}));
		},
		async listPersonCompletions(personnelId) {
			const result = await selectAllSupabaseRows<TrainingCompletionRow>(async (from, to) => {
				const { data, error } = await client
					.from('personnel_trainings')
					.select(TRAINING_COMPLETION_FIELDS)
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId)
					.order('id', { ascending: true })
					.range(from, to)
					.returns<TrainingCompletionRow[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(toTrainingCompletion);
		},
		async listPersonHistory(personnelId) {
			const result = await selectAllSupabaseRows<TrainingCompletionHistoryRow>(async (from, to) => {
				const { data, error } = await client
					.from('personnel_training_history')
					.select(TRAINING_COMPLETION_HISTORY_FIELDS)
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId)
					.order('id', { ascending: true })
					.range(from, to)
					.returns<TrainingCompletionHistoryRow[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(toTrainingCompletionHistoryEntry);
		},
		async findEntry(kind, id) {
			const { data, error } = await client
				.from(TRAINING_COMPLETION_TABLES[kind])
				.select(TRAINING_COMPLETION_ENTRY_FIELDS)
				.eq('organization_id', orgId)
				.eq('id', id)
				.maybeSingle<TrainingCompletionEntryRow>();
			if (error) throw new Error(error.message);
			return data ? toTrainingCompletionEntryResource(data) : null;
		},
		async correctEntry(kind, id, fields) {
			const { data, error } = await client.rpc('correct_training_completion', {
				p_organization_id: orgId,
				p_kind: kind,
				p_id: id,
				p_completion_date: fields.completionDate,
				p_expiration_date: fields.expirationDate,
				p_notes: fields.notes
			});
			if (error) throw new Error(error.message);
			if (data === null) return null;
			return kind === 'current'
				? toTrainingCompletion(data as TrainingCompletionRow)
				: toTrainingCompletionHistoryEntry(data as TrainingCompletionHistoryRow);
		},
		async createRecord(input) {
			const { data, error } = await client
				.from('personnel_trainings')
				.insert(trainingCompletionCreateRow(input, orgId))
				.select(TRAINING_COMPLETION_FIELDS)
				.single<TrainingCompletionRow>();
			if (error) throw new Error(error.message);
			return toTrainingCompletion(data);
		},
		async patchRecord(id, fields) {
			const { data, error } = await client
				.from('personnel_trainings')
				.update(trainingCompletionPatchRow(fields))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(TRAINING_COMPLETION_FIELDS)
				.single<TrainingCompletionRow>();
			if (error) throw new Error(error.message);
			return toTrainingCompletion(data);
		},
		async deleteRecord(id) {
			const { error } = await client.from('personnel_trainings').delete().eq('organization_id', orgId).eq('id', id);
			if (error) throw new Error(error.message);
		},
		async upsertCompleted(rows) {
			const { data, error } = await client
				.from('personnel_trainings')
				.upsert(
					rows.map((row) => trainingCompletedRow(row, orgId)),
					{ onConflict: 'organization_id,personnel_id,training_type_id' }
				)
				.select(TRAINING_COMPLETION_FIELDS)
				.returns<TrainingCompletionRow[]>();
			if (error) throw new Error(error.message);
			return (data ?? []).map(toTrainingCompletion);
		}
	};
}

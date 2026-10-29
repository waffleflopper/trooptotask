import type { SupabaseClient } from '$lib/server/database';
import { SUPABASE_PAGE_SIZE, selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { TrainingCompletionPersistence, TrainingCompletionReadScope } from '../contracts';
import {
	TRAINING_COMPLETION_FIELDS,
	TRAINING_WORKSPACE_COMPLETION_FIELDS,
	TRAINING_READINESS_COMPLETION_FIELDS,
	toTrainingCompletionFacts,
	toWorkspaceTrainingCompletion,
	type TrainingCompletionReadRow,
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

const IDS_PER_FILTER = 50;

export function createSupabaseTrainingCompletionPersistence(
	client: SupabaseClient,
	orgId: string
): TrainingCompletionPersistence {
	type Page = { personnelIds?: readonly string[]; trainingTypeIds?: readonly string[]; from: number };

	async function readCompletions(fields: string, scope?: TrainingCompletionReadScope) {
		const partitions: Page[] = [];
		if (!scope) partitions.push({ from: 0 });
		else {
			const people = [...new Set(scope.personnelIds)];
			const types = scope.trainingTypeIds === undefined ? undefined : [...new Set(scope.trainingTypeIds)];
			if (types?.length === 0) return [];
			// A Person has at most one row per type, so this many People fit one page. An unfiltered read assumes a
			// full type chunk; a larger catalog still pages by count.
			const typesPerPartition = Math.min(types?.length ?? IDS_PER_FILTER, IDS_PER_FILTER);
			const peoplePerPartition = Math.min(IDS_PER_FILTER, Math.floor(SUPABASE_PAGE_SIZE / typesPerPartition));
			for (let personIndex = 0; personIndex < people.length; personIndex += peoplePerPartition) {
				const personnelIds = people.slice(personIndex, personIndex + peoplePerPartition);
				if (!types) partitions.push({ personnelIds, from: 0 });
				else {
					for (let typeIndex = 0; typeIndex < types.length; typeIndex += IDS_PER_FILTER) {
						partitions.push({
							personnelIds,
							trainingTypeIds: types.slice(typeIndex, typeIndex + IDS_PER_FILTER),
							from: 0
						});
					}
				}
			}
		}

		async function readPages(pages: Page[]) {
			const results = [];
			for (let index = 0; index < pages.length; index += 4) {
				const batch = await Promise.all(
					pages.slice(index, index + 4).map(async (page) => {
						let query = client
							.from('personnel_trainings')
							.select(fields, page.from === 0 ? { count: 'exact' } : {})
							.eq('organization_id', orgId);
						if (page.personnelIds) query = query.in('personnel_id', [...page.personnelIds]);
						if (page.trainingTypeIds) query = query.in('training_type_id', [...page.trainingTypeIds]);
						return query
							.order('id', { ascending: true })
							.range(page.from, page.from + SUPABASE_PAGE_SIZE - 1)
							.returns<TrainingCompletionReadRow[]>();
					})
				);
				for (const result of batch) {
					if (result.error) throw new Error(result.error.message);
					results.push(result);
				}
			}
			return results;
		}

		const firstPages = await readPages(partitions);
		const remaining: Page[] = [];
		for (const [index, first] of firstPages.entries()) {
			if (first.count === null) throw new Error('Training completion count unavailable');
			for (let from = SUPABASE_PAGE_SIZE; from < first.count; from += SUPABASE_PAGE_SIZE) {
				remaining.push({ ...partitions[index], from });
			}
		}
		const pages = [...firstPages, ...(await readPages(remaining))];
		return pages.flatMap((page) => page.data ?? []);
	}

	return {
		async listCompletions() {
			return (await readCompletions(TRAINING_WORKSPACE_COMPLETION_FIELDS))
				.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
				.map(toWorkspaceTrainingCompletion);
		},
		async listReadinessCompletions(scope) {
			return (await readCompletions(TRAINING_READINESS_COMPLETION_FIELDS, scope)).map(toTrainingCompletionFacts);
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
				.select('id, completion_date, expiration_date')
				.eq('organization_id', orgId)
				.eq('personnel_id', personnelId)
				.eq('training_type_id', trainingTypeId)
				.single<{ id: string; completion_date: string | null; expiration_date: string | null }>();
			if (error?.code === 'PGRST116') return null;
			if (error) throw new Error(error.message);
			return data ? { id: data.id, completionDate: data.completion_date, expirationDate: data.expiration_date } : null;
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

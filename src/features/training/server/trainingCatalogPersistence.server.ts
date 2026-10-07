import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { TrainingCatalogPersistence, TrainingTypeTiming, TrainingTypeImportReference } from '../contracts';
import {
	TRAINING_TYPE_FIELDS,
	TRAINING_VIEW_FIELDS,
	toTrainingType,
	toTrainingView,
	trainingTypeCreateRow,
	trainingTypePatchRow,
	trainingViewCreateRow,
	trainingViewPatchRow,
	type TrainingTypeRow,
	type TrainingViewRow
} from './trainingPersistenceMapping.server';

export function createSupabaseTrainingCatalogPersistence(
	client: SupabaseClient,
	orgId: string
): TrainingCatalogPersistence {
	return {
		async listTypes() {
			const result = await selectAllSupabaseRows<TrainingTypeRow>(async (from, to) => {
				const { data, error } = await client
					.from('training_types')
					.select(TRAINING_TYPE_FIELDS)
					.eq('organization_id', orgId)
					.order('sort_order', { ascending: true })
					.range(from, to)
					.returns<TrainingTypeRow[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(toTrainingType);
		},
		async listViews() {
			const result = await selectAllSupabaseRows<TrainingViewRow>(async (from, to) => {
				const { data, error } = await client
					.from('training_views')
					.select(TRAINING_VIEW_FIELDS)
					.eq('organization_id', orgId)
					.order('name', { ascending: true })
					.range(from, to)
					.returns<TrainingViewRow[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(toTrainingView);
		},
		async listTypeLabels() {
			const result = await selectAllSupabaseRows<{ id: string; name: string }>(async (from, to) => {
				const { data, error } = await client
					.from('training_types')
					.select('id, name')
					.eq('organization_id', orgId)
					.range(from, to)
					.returns<{ id: string; name: string }[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(({ id, name }) => ({ id, name }));
		},
		async listRankApplicabilityReferences() {
			const result = await selectAllSupabaseRows<{ applies_to_ranks?: unknown; excluded_ranks?: unknown }>(
				async (from, to) => {
					const { data, error } = await client
						.from('training_types')
						.select('applies_to_ranks, excluded_ranks')
						.eq('organization_id', orgId)
						.range(from, to)
						.returns<{ applies_to_ranks?: unknown; excluded_ranks?: unknown }[]>();
					return { data, error };
				}
			);
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map((row) => ({
				appliesToRanks: row.applies_to_ranks,
				excludedRanks: row.excluded_ranks
			}));
		},
		async countTypesEstimated() {
			const { count, error } = await client
				.from('training_types')
				.select('id', { count: 'estimated' })
				.eq('organization_id', orgId)
				.range(0, 0);
			if (error) throw new Error(error.message);
			return count ?? 0;
		},
		async findTypeByName(name) {
			const { data, error } = await client
				.from('training_types')
				.select(TRAINING_TYPE_FIELDS)
				.eq('organization_id', orgId)
				.eq('name', name)
				.single<TrainingTypeRow>();
			if (error?.code === 'PGRST116') return null;
			if (error) throw new Error(error.message);
			return data ? toTrainingType(data) : null;
		},
		async listExistingTypeNames(names) {
			if (names.length === 0) return [];
			const result = await selectAllSupabaseRows<{ name: string }>(async (from, to) => {
				const { data, error } = await client
					.from('training_types')
					.select('name')
					.eq('organization_id', orgId)
					.in('name', [...names])
					.range(from, to)
					.returns<{ name: string }[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map((row) => row.name);
		},
		async hasTypes() {
			const { data, error } = await client.from('training_types').select('id').eq('organization_id', orgId).limit(1);
			if (error) throw new Error(error.message);
			return (data?.length ?? 0) > 0;
		},
		async findTypeTiming(id) {
			const { data, error } = await client
				.from('training_types')
				.select('expiration_months, expiration_date_only')
				.eq('organization_id', orgId)
				.eq('id', id)
				.single<{ expiration_months: number | null; expiration_date_only: boolean | null }>();
			if (error?.code === 'PGRST116') return null;
			if (error) throw new Error(error.message);
			return data
				? ({
						...('expiration_months' in data ? { expirationMonths: data.expiration_months } : {}),
						...('expiration_date_only' in data ? { expirationDateOnly: data.expiration_date_only } : {})
					} as TrainingTypeTiming)
				: null;
		},
		async listTypeImportReferences(ids) {
			const result = await selectAllSupabaseRows<{
				id: string;
				expiration_months: number | null;
				expiration_date_only: boolean | null;
				can_be_exempted: boolean | null;
				exempt_personnel_ids: string[] | null;
			}>(async (from, to) => {
				const { data, error } = await client
					.from('training_types')
					.select('id, expiration_months, expiration_date_only, can_be_exempted, exempt_personnel_ids')
					.eq('organization_id', orgId)
					.in('id', [...ids])
					.range(from, to)
					.returns<
						{
							id: string;
							expiration_months: number | null;
							expiration_date_only: boolean | null;
							can_be_exempted: boolean | null;
							exempt_personnel_ids: string[] | null;
						}[]
					>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(
				(row) =>
					({
						id: row.id,
						...('expiration_months' in row ? { expirationMonths: row.expiration_months } : {}),
						...('expiration_date_only' in row ? { expirationDateOnly: row.expiration_date_only } : {}),
						...('can_be_exempted' in row ? { canBeExempted: row.can_be_exempted } : {}),
						...('exempt_personnel_ids' in row ? { exemptPersonnelIds: row.exempt_personnel_ids } : {})
					}) as TrainingTypeImportReference
			);
		},
		async findTypeId(id) {
			const { data, error } = await client
				.from('training_types')
				.select('id')
				.eq('organization_id', orgId)
				.eq('id', id)
				.single<{ id: string }>();
			if (error?.code === 'PGRST116') return null;
			if (error) throw new Error(error.message);
			return data ? data : null;
		},
		async createType(input) {
			const { data, error } = await client
				.from('training_types')
				.insert(trainingTypeCreateRow(input, orgId))
				.select(TRAINING_TYPE_FIELDS)
				.single<TrainingTypeRow>();
			if (error) throw new Error(error.message);
			return toTrainingType(data);
		},
		async patchType(id, fields) {
			const { data, error } = await client
				.from('training_types')
				.update(trainingTypePatchRow(fields))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(TRAINING_TYPE_FIELDS)
				.single<TrainingTypeRow>();
			if (error) throw new Error(error.message);
			return toTrainingType(data);
		},
		async deleteType(id) {
			const { error } = await client.from('training_types').delete().eq('organization_id', orgId).eq('id', id);
			if (error) throw new Error(error.message);
		},
		async createView(input) {
			const { data, error } = await client
				.from('training_views')
				.insert(trainingViewCreateRow(input, orgId))
				.select(TRAINING_VIEW_FIELDS)
				.single<TrainingViewRow>();
			if (error) throw new Error(error.message);
			return toTrainingView(data);
		},
		async patchView(id, fields) {
			const { data, error } = await client
				.from('training_views')
				.update(trainingViewPatchRow(fields))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(TRAINING_VIEW_FIELDS)
				.single<TrainingViewRow>();
			if (error) throw new Error(error.message);
			return toTrainingView(data);
		},
		async deleteView(id) {
			const { error } = await client.from('training_views').delete().eq('organization_id', orgId).eq('id', id);
			if (error) throw new Error(error.message);
		}
	};
}

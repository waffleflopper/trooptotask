import type { SupabaseClient } from '$lib/server/database';
import { fail } from '$lib/errors';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { TrainingCatalogPersistence, TrainingTypeTiming, TrainingTypeImportReference } from '../contracts';
import {
	TRAINING_TYPE_FIELDS,
	TRAINING_TYPE_NAME_EXISTS_MESSAGE,
	TRAINING_TYPE_ORDER_CHANGED_MESSAGE,
	TRAINING_TYPE_ORDER_INVALID_MESSAGE,
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

function throwTrainingTypeWriteError(error: { code?: string; message: string }): never {
	if (error.code === '23505' && error.message.includes('"training_types_clinic_id_name_key"')) {
		fail(409, TRAINING_TYPE_NAME_EXISTS_MESSAGE);
	}
	throw new Error(error.message);
}

const EXEMPTION_ERROR_STATUS: Record<string, number> = { '42501': 403, P0002: 404, '55000': 409 };

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
					.order('id', { ascending: true })
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
					.order('id', { ascending: true })
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
					.order('id', { ascending: true })
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
						.order('id', { ascending: true })
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
					.order('id', { ascending: true })
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
		async setPersonExemption(typeId, personnelId, exempt) {
			const { error } = await client.rpc('set_training_exemption', {
				p_organization_id: orgId,
				p_training_type_id: typeId,
				p_personnel_id: personnelId,
				p_exempt: exempt
			});
			if (!error) return;
			const status = EXEMPTION_ERROR_STATUS[error.code];
			if (status) fail(status, error.message);
			throw new Error(error.message);
		},
		async createType(input) {
			const { data, error } = await client
				.from('training_types')
				.insert(trainingTypeCreateRow(input, orgId))
				.select(TRAINING_TYPE_FIELDS)
				.single<TrainingTypeRow>();
			if (error) throwTrainingTypeWriteError(error);
			return toTrainingType(data);
		},
		async patchType(id, fields) {
			const { data, error } = await client
				.from('training_types')
				.update(trainingTypePatchRow(fields))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(TRAINING_TYPE_FIELDS)
				.maybeSingle<TrainingTypeRow>();
			if (error) throwTrainingTypeWriteError(error);
			return data ? toTrainingType(data) : null;
		},
		async deleteType(id) {
			const { error } = await client.from('training_types').delete().eq('organization_id', orgId).eq('id', id);
			if (error) throw new Error(error.message);
		},
		async setTypeOrder(ids, expectedIds) {
			const { error } = await client.rpc('set_training_type_order', {
				p_organization_id: orgId,
				p_training_type_ids: [...ids],
				p_expected_training_type_ids: [...expectedIds]
			});
			if (!error) return;
			if (error.code === '42501') fail(403, 'You do not have access to configure Training');
			if (error.code === '22023') fail(400, TRAINING_TYPE_ORDER_INVALID_MESSAGE);
			if (error.code === 'TTO01') fail(409, TRAINING_TYPE_ORDER_CHANGED_MESSAGE);
			throw new Error(error.message);
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
				.maybeSingle<TrainingViewRow>();
			if (error) throw new Error(error.message);
			return data ? toTrainingView(data) : null;
		},
		async deleteView(id) {
			const { error } = await client.from('training_views').delete().eq('organization_id', orgId).eq('id', id);
			if (error) throw new Error(error.message);
		}
	};
}

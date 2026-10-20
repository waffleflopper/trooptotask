import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { RatingSchemePersistence } from '../contracts';
import {
	mapRatingSchemeEntry,
	ratingSchemeCreateValues,
	ratingSchemePatchValues,
	RATING_SCHEME_SELECT,
	type RatingSchemeRow
} from './ratingSchemeEntryMapping.server';

export function createSupabaseRatingSchemePersistence(client: SupabaseClient, orgId: string): RatingSchemePersistence {
	return {
		async listWorkspace() {
			const { data, error } = await selectAllSupabaseRows<RatingSchemeRow>(async (from, to) => {
				return client
					.from('rating_scheme_entries')
					.select(RATING_SCHEME_SELECT)
					.eq('organization_id', orgId)
					.order('rating_period_end', { ascending: true })
					.order('id', { ascending: true })
					.range(from, to);
			});
			if (error) throw new Error((error as { message?: string }).message ?? 'Supabase query failed');
			return (data ?? []).map(mapRatingSchemeEntry);
		},
		async findWriteReference(id) {
			const { data, error } = await client
				.from('rating_scheme_entries')
				.select(
					'rated_person_id,rater_person_id,senior_rater_person_id,intermediate_rater_person_id,reviewer_person_id'
				)
				.eq('organization_id', orgId)
				.eq('id', id)
				.single();
			if (error) {
				if (error.code === 'PGRST116') return null;
				throw new Error(error.message);
			}
			return data
				? {
						ratedPersonId: data.rated_person_id,
						raterPersonId: data.rater_person_id,
						seniorRaterPersonId: data.senior_rater_person_id,
						intermediateRaterPersonId: data.intermediate_rater_person_id,
						reviewerPersonId: data.reviewer_person_id
					}
				: null;
		},
		async listPersonReadiness(personnelId) {
			const { data, error } = await selectAllSupabaseRows<RatingSchemeRow>(async (from, to) => {
				return client
					.from('rating_scheme_entries')
					.select(RATING_SCHEME_SELECT)
					.eq('organization_id', orgId)
					.eq('rated_person_id', personnelId)
					.order('rating_period_end', { ascending: false })
					.order('id', { ascending: false })
					.range(from, to);
			});
			if (error) throw new Error((error as { message?: string }).message ?? 'Supabase query failed');
			return (data ?? []).map(mapRatingSchemeEntry);
		},
		async countEntries() {
			const { count, error } = await client
				.from('rating_scheme_entries')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', orgId);
			if (error) throw new Error(error.message);
			return count ?? 0;
		},
		async create(input) {
			const { data, error } = await client
				.from('rating_scheme_entries')
				.insert({ ...ratingSchemeCreateValues(input), organization_id: orgId })
				.select(RATING_SCHEME_SELECT)
				.single();
			if (error) throw new Error(error.message);
			return mapRatingSchemeEntry(data as RatingSchemeRow);
		},
		async update(id, patch) {
			const { data, error } = await client
				.from('rating_scheme_entries')
				.update(ratingSchemePatchValues(patch))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(RATING_SCHEME_SELECT)
				.maybeSingle();
			if (error) throw new Error(error.message);
			return data ? mapRatingSchemeEntry(data as RatingSchemeRow) : null;
		},
		async delete(id) {
			const { error } = await client.from('rating_scheme_entries').delete().eq('organization_id', orgId).eq('id', id);
			if (error) throw new Error(error.message);
		}
	};
}

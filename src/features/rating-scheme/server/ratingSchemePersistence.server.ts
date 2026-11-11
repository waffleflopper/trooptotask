import type { SupabaseClient } from '$lib/server/database';
import { fail } from '$lib/errors';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { RatingSchemePersistence } from '../contracts';
import { EVALUATION_GONE, lifecycleFailure } from './ratingSchemeLifecycleFailure.server';
import {
	mapRatingSchemeEntry,
	ratingSchemeCreateValues,
	ratingSchemePatchValues,
	RATING_SCHEME_SELECT,
	type RatingSchemeRow
} from './ratingSchemeEntryMapping.server';

export function createSupabaseRatingSchemePersistence(client: SupabaseClient, orgId: string): RatingSchemePersistence {
	async function findEntry(id: string) {
		const { data, error } = await client
			.from('rating_scheme_entries')
			.select(RATING_SCHEME_SELECT)
			.eq('organization_id', orgId)
			.eq('id', id)
			.maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return fail(404, EVALUATION_GONE);
		return mapRatingSchemeEntry(data as RatingSchemeRow);
	}

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
		},
		async transition(id, to) {
			const { data, error } = await client.rpc('transition_rating_scheme_entry', {
				p_organization_id: orgId,
				p_entry_id: id,
				p_to: to ?? undefined
			});
			if (error) return lifecycleFailure(error);
			return { entry: await findEntry(id), moved: data === true };
		},
		async changeRater(id, change) {
			const { data, error } = await client.rpc('change_rating_scheme_rater', {
				p_organization_id: orgId,
				p_entry_id: id,
				p_change_date: change.changeDate,
				p_rater_person_id: change.raterPersonId ?? undefined,
				p_rater_name: change.raterName ?? undefined
			});
			if (error) return lifecycleFailure(error);
			const [entry, successor] = await Promise.all([findEntry(id), data ? findEntry(data) : null]);
			return { entry, successor };
		}
	};
}

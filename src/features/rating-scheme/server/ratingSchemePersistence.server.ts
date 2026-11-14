import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { RatingSchemePersistence } from '../contracts';
import { lifecycleFailure } from './ratingSchemeLifecycleFailure.server';
import {
	EVALUATION_SELECT,
	evaluationPatchValues,
	mapEvaluation,
	mapRatingScheme,
	RATING_SCHEME_SELECT,
	ratingSchemeCreateValues,
	ratingSchemePatchValues,
	type EvaluationRow,
	type RatingSchemeRow
} from './ratingSchemeEntryMapping.server';

function queryFailure(error: unknown): never {
	throw new Error((error as { message?: string }).message ?? 'Supabase query failed');
}

export function createSupabaseRatingSchemePersistence(client: SupabaseClient, orgId: string): RatingSchemePersistence {
	async function listSchemes(personnelId?: string) {
		const { data, error } = await selectAllSupabaseRows<RatingSchemeRow>(async (from, to) => {
			let query = client.from('rating_schemes').select(RATING_SCHEME_SELECT).eq('organization_id', orgId);
			if (personnelId) query = query.eq('rated_person_id', personnelId);
			return query.order('id', { ascending: true }).range(from, to);
		});
		if (error) queryFailure(error);
		return (data ?? []).map(mapRatingScheme);
	}

	async function listEvaluations(personnelId?: string) {
		const { data, error } = await selectAllSupabaseRows<EvaluationRow>(async (from, to) => {
			let query = client.from('evaluations').select(EVALUATION_SELECT).eq('organization_id', orgId);
			if (personnelId) query = query.eq('rated_person_id', personnelId);
			const ascending = !personnelId;
			return query.order('rating_period_end', { ascending }).order('id', { ascending }).range(from, to);
		});
		if (error) queryFailure(error);
		return (data ?? []).map(mapEvaluation);
	}

	return {
		listRatingSchemes: () => listSchemes(),
		listEvaluations: () => listEvaluations(),
		async findRatingScheme(id) {
			const { data, error } = await client
				.from('rating_schemes')
				.select(RATING_SCHEME_SELECT)
				.eq('organization_id', orgId)
				.eq('id', id)
				.maybeSingle();
			if (error) queryFailure(error);
			return data ? mapRatingScheme(data as RatingSchemeRow) : null;
		},
		async findEvaluationReference(id) {
			const { data, error } = await client
				.from('evaluations')
				.select('rating_scheme_id,rated_person_id,rating_schemes(rater_person_id)')
				.eq('organization_id', orgId)
				.eq('id', id)
				.maybeSingle();
			if (error) queryFailure(error);
			if (!data) return null;
			const scheme = data.rating_schemes as { rater_person_id: string | null } | null;
			return {
				ratingSchemeId: data.rating_scheme_id,
				ratedPersonId: data.rated_person_id,
				raterPersonId: scheme?.rater_person_id ?? null
			};
		},
		async listPersonReadiness(personnelId) {
			const [ratingSchemes, evaluations] = await Promise.all([listSchemes(personnelId), listEvaluations(personnelId)]);
			return { ratingSchemes, evaluations };
		},
		async countRatingSchemes() {
			const { count, error } = await client
				.from('rating_schemes')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', orgId);
			if (error) queryFailure(error);
			return count ?? 0;
		},
		async createRatingScheme(input) {
			const { data, error } = await client
				.from('rating_schemes')
				.insert({ ...ratingSchemeCreateValues(input), organization_id: orgId })
				.select(RATING_SCHEME_SELECT)
				.single();
			if (error) return lifecycleFailure(error);
			return mapRatingScheme(data as RatingSchemeRow);
		},
		async updateRatingScheme(id, patch) {
			const { data, error } = await client
				.from('rating_schemes')
				.update(ratingSchemePatchValues(patch))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(RATING_SCHEME_SELECT)
				.maybeSingle();
			if (error) return lifecycleFailure(error);
			if (!data) return null;
			return mapRatingScheme(data as RatingSchemeRow);
		},
		async setRatingSchemeArchived(id, archived) {
			const { data, error } = await client.rpc('set_rating_scheme_archived', {
				p_organization_id: orgId,
				p_rating_scheme_id: id,
				p_archived: archived
			});
			if (error) return lifecycleFailure(error);
			const result = data as { changed: boolean; ratingScheme: RatingSchemeRow };
			return { ratingScheme: mapRatingScheme(result.ratingScheme), changed: result.changed };
		},
		async startEvaluation(ratingSchemeId, start) {
			const { data, error } = await client.rpc('start_evaluation', {
				p_organization_id: orgId,
				p_rating_scheme_id: ratingSchemeId,
				p_report_type: start.reportType ?? '',
				p_rating_period_start: start.ratingPeriodStart,
				p_rating_period_end: start.ratingPeriodEnd,
				p_completed: start.completed,
				p_notes: start.notes ?? undefined
			});
			if (error) return lifecycleFailure(error);
			const result = data as { created: boolean; evaluation: EvaluationRow };
			return { evaluation: mapEvaluation(result.evaluation), created: result.created };
		},
		async updateEvaluation(id, patch) {
			const { data, error } = await client
				.from('evaluations')
				.update(evaluationPatchValues(patch))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(EVALUATION_SELECT)
				.maybeSingle();
			if (error) return lifecycleFailure(error);
			return data ? mapEvaluation(data as EvaluationRow) : null;
		},
		async deleteEvaluation(id) {
			const { error } = await client.from('evaluations').delete().eq('organization_id', orgId).eq('id', id);
			if (error) queryFailure(error);
		},
		async transitionEvaluation(id, { from, to }) {
			const { data, error } = await client.rpc('transition_evaluation', {
				p_organization_id: orgId,
				p_evaluation_id: id,
				p_from: from ?? undefined,
				p_to: to ?? undefined
			});
			if (error) return lifecycleFailure(error);
			const result = data as { moved: boolean; evaluation: EvaluationRow };
			return { evaluation: mapEvaluation(result.evaluation), moved: result.moved };
		},
		async changeEvaluationRater(id, change) {
			const { data, error } = await client.rpc('change_evaluation_rater', {
				p_organization_id: orgId,
				p_evaluation_id: id,
				p_change_date: change.changeDate,
				p_rater_person_id: change.raterPersonId ?? undefined,
				p_rater_name: change.raterName ?? undefined
			});
			if (error) return lifecycleFailure(error);
			const result = data as {
				evaluation: EvaluationRow;
				ratingScheme: RatingSchemeRow;
				successor: EvaluationRow | null;
			};
			return {
				evaluation: mapEvaluation(result.evaluation),
				ratingScheme: mapRatingScheme(result.ratingScheme),
				successor: result.successor && mapEvaluation(result.successor)
			};
		}
	};
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RosterSourceQuery, RosterSourceRead } from '$features/personnel/contracts';
import type { RatingSchemeEntry } from '../rating-scheme.types';
import { projectActiveEvaluation, type ActiveEvaluationProjection } from './personnelActiveEvaluation.server';

type EntryTuple = [
	personnelId: string,
	id: string,
	evalType: RatingSchemeEntry['evalType'],
	reportType: RatingSchemeEntry['reportType'],
	ratingPeriodStart: string,
	ratingPeriodEnd: string,
	status: RatingSchemeEntry['status'],
	workflowStatus: RatingSchemeEntry['workflowStatus']
];

/** Each visible active Person's active evaluation, or null when none is open, in one statement. */
export function createSupabaseRatingSchemeRosterSignals(client: SupabaseClient, orgId: string) {
	return async ({
		asOf,
		personnelIds
	}: RosterSourceQuery): Promise<RosterSourceRead<ActiveEvaluationProjection | null>> => {
		const { data, error } = await client.rpc('roster_signal_evaluations', {
			p_organization_id: orgId,
			p_personnel_ids: personnelIds
		});
		if (error) throw new Error(error.message);
		const { cohort, entries } = data as { cohort: string[]; entries: EntryTuple[] };
		const read = new Map<string, ActiveEvaluationProjection | null>(cohort.map((id) => [id, null]));
		for (const [
			personnelId,
			id,
			evalType,
			reportType,
			ratingPeriodStart,
			ratingPeriodEnd,
			status,
			workflowStatus
		] of entries) {
			read.set(
				personnelId,
				projectActiveEvaluation(
					{ id, evalType, reportType, ratingPeriodStart, ratingPeriodEnd, status, workflowStatus },
					asOf
				)
			);
		}
		return read;
	};
}

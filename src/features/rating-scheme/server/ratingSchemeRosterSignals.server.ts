import type { RosterSignalSlices, RosterSourceQuery, RosterSourceRead } from '$features/personnel/contracts';
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
export function createSupabaseRatingSchemeRosterSignals(slices: RosterSignalSlices) {
	return async (query: RosterSourceQuery): Promise<RosterSourceRead<ActiveEvaluationProjection | null>> => {
		const { cohort, entries } = (await slices('evaluations', query)) as { cohort: string[]; entries: EntryTuple[] };
		const { asOf } = query;
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

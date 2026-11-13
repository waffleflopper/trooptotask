import type { Evaluation, RatingScheme } from '../rating-scheme.types';
import { isEvaluationOpen } from './ratingSchemeEntries';

/** One Rating Scheme line: a Rated Individual's standing chain, and the one Evaluation open on it, if any. */
export interface RatingSchemeLine extends RatingScheme {
	/** The scheme's open, tracked Evaluation. Not tracked and completed ones are not open. */
	open: Evaluation | null;
}

/** Every scheme with its open Evaluation, in the schemes' order. A scheme holds one; if old data holds more, the later thru wins. */
export function toRatingSchemeLines(
	schemes: readonly RatingScheme[],
	evaluations: readonly Evaluation[]
): RatingSchemeLine[] {
	const openBySchemeId = new Map<string, Evaluation>();
	for (const evaluation of evaluations) {
		if (!isEvaluationOpen(evaluation.workflowStatus)) continue;
		const known = openBySchemeId.get(evaluation.ratingSchemeId);
		if (!known || known.ratingPeriodEnd < evaluation.ratingPeriodEnd) {
			openBySchemeId.set(evaluation.ratingSchemeId, evaluation);
		}
	}
	return schemes.map((scheme) => ({ ...scheme, open: openBySchemeId.get(scheme.id) ?? null }));
}

/** A scheme is locked to its rater while an Evaluation is open; Change rater closes that Evaluation first. */
export function isRaterLocked(line: Pick<RatingSchemeLine, 'open'>): boolean {
	return line.open !== null;
}

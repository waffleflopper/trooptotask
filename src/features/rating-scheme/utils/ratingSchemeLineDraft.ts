import type { PersonnelLookup } from '$features/personnel/contracts';
import type { EvalType } from '../rating-scheme.types';
import type { RatingSchemeCreateValues, RatingSchemePatchValues } from '../contracts';
import { getEvalTypeForRank } from './ratingScheme';
import { EVALUATOR_CHAIN_KEYS } from './ratingSchemeEntries';
import { evaluatorDraft, type EvaluatorDraft } from './evaluatorDraft';
import type { RatingSchemeLine } from './ratingSchemeLines';

/** What the scheme line sheet edits: the standing chain, the eval type each new Evaluation starts with, and notes. */
export interface RatingSchemeLineDraft {
	ratedPersonId: string;
	evalType: EvalType;
	rater: EvaluatorDraft;
	showIntermediate: boolean;
	intermediateRater: EvaluatorDraft;
	seniorRater: EvaluatorDraft;
	showReviewer: boolean;
	reviewer: EvaluatorDraft;
	notes: string;
}

/** One save of the line sheet: a new scheme, or only what the edit changed on an existing one. */
export type RatingSchemeLineSave =
	| { kind: 'create'; values: RatingSchemeCreateValues }
	| { kind: 'update'; patch: RatingSchemePatchValues };

export type RatingSchemeLineRequiredField = 'ratedPerson' | 'rater' | 'seniorRater';

export function createRatingSchemeLineDraft(line: RatingSchemeLine | null): RatingSchemeLineDraft {
	return {
		ratedPersonId: line?.ratedPersonId ?? '',
		evalType: line?.evalType ?? 'NCOER',
		rater: evaluatorDraft(line?.raterPersonId, line?.raterName),
		showIntermediate: !!(line?.intermediateRaterPersonId || line?.intermediateRaterName),
		intermediateRater: evaluatorDraft(line?.intermediateRaterPersonId, line?.intermediateRaterName),
		seniorRater: evaluatorDraft(line?.seniorRaterPersonId, line?.seniorRaterName),
		showReviewer: !!(line?.reviewerPersonId || line?.reviewerName),
		reviewer: evaluatorDraft(line?.reviewerPersonId, line?.reviewerName),
		notes: line?.notes ?? ''
	};
}

/** Picking the Soldier on a new line sets the eval type their rank implies. */
export function applyRatedPersonToLineDraft(draft: RatingSchemeLineDraft, personnel: readonly PersonnelLookup[]): void {
	const person = personnel.find((candidate) => candidate.id === draft.ratedPersonId);
	if (person) draft.evalType = getEvalTypeForRank(person.rank);
}

function hasEvaluator(evaluator: EvaluatorDraft): boolean {
	return evaluator.kind === 'person' || (evaluator.kind === 'external' && !!evaluator.name.trim());
}

export function missingLineFields(draft: RatingSchemeLineDraft): RatingSchemeLineRequiredField[] {
	const missing: RatingSchemeLineRequiredField[] = [];
	if (!draft.ratedPersonId) missing.push('ratedPerson');
	if (!hasEvaluator(draft.rater)) missing.push('rater');
	if (!hasEvaluator(draft.seniorRater)) missing.push('seniorRater');
	return missing;
}

function chainSlot(evaluator: EvaluatorDraft, shown = true): { personId: string | null; name: string | null } {
	if (!shown) return { personId: null, name: null };
	return {
		personId: evaluator.kind === 'person' ? evaluator.personId || null : null,
		name: evaluator.kind === 'external' ? evaluator.name.trim() || null : null
	};
}

export function buildRatingSchemeLineValues(draft: RatingSchemeLineDraft): RatingSchemeCreateValues {
	const rater = chainSlot(draft.rater);
	const intermediate = chainSlot(draft.intermediateRater, draft.showIntermediate);
	const senior = chainSlot(draft.seniorRater);
	const reviewer = chainSlot(draft.reviewer, draft.showReviewer);
	return {
		ratedPersonId: draft.ratedPersonId,
		evalType: draft.evalType,
		raterPersonId: rater.personId,
		raterName: rater.name,
		intermediateRaterPersonId: intermediate.personId,
		intermediateRaterName: intermediate.name,
		seniorRaterPersonId: senior.personId,
		seniorRaterName: senior.name,
		reviewerPersonId: reviewer.personId,
		reviewerName: reviewer.name,
		notes: draft.notes.trim() || null
	};
}

/** Only what this edit changed against what the sheet opened with, so a save never rewrites a field another editor moved. */
export function planRatingSchemeLineSave(
	opened: RatingSchemeCreateValues,
	edited: RatingSchemeCreateValues
): RatingSchemePatchValues | null {
	const patch: Record<string, unknown> = {};
	for (const key of EVALUATOR_CHAIN_KEYS) {
		if ((opened[key] ?? null) !== (edited[key] ?? null)) patch[key] = edited[key] ?? null;
	}
	if (opened.evalType !== edited.evalType) patch.evalType = edited.evalType;
	if ((opened.notes ?? null) !== (edited.notes ?? null)) patch.notes = edited.notes ?? null;
	return Object.keys(patch).length ? (patch as RatingSchemePatchValues) : null;
}

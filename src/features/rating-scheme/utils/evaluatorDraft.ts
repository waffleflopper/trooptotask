/** One evaluator slot as a form holds it: nobody yet, a Person in the unit, or a name from outside it. */
export type EvaluatorDraft =
	| { kind: 'empty' }
	| { kind: 'person'; personId: string }
	| { kind: 'external'; name: string };

export function evaluatorDraft(personId: string | null | undefined, name: string | null | undefined): EvaluatorDraft {
	if (personId) return { kind: 'person', personId };
	if (name) return { kind: 'external', name };
	return { kind: 'empty' };
}

export function setEvaluatorFromPicker(value: { personId: string } | { externalName: string } | null): EvaluatorDraft {
	if (!value) return { kind: 'empty' };
	if ('personId' in value) return value.personId ? { kind: 'person', personId: value.personId } : { kind: 'empty' };
	const name = value.externalName.trim();
	return name ? { kind: 'external', name } : { kind: 'empty' };
}

export function removeIntermediateRaterFromDraft(draft: {
	showIntermediate: boolean;
	intermediateRater: EvaluatorDraft;
}): void {
	draft.showIntermediate = false;
	draft.intermediateRater = { kind: 'empty' };
}

export function removeReviewerFromDraft(draft: { showReviewer: boolean; reviewer: EvaluatorDraft }): void {
	draft.showReviewer = false;
	draft.reviewer = { kind: 'empty' };
}

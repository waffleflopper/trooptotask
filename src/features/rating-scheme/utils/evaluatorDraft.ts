import type { PersonnelLookup } from '$features/personnel/contracts';

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

/** The slot as the scheme or Evaluation stores it: a Personnel Record, a trimmed name, or neither. */
export function evaluatorValues(evaluator: EvaluatorDraft): { personId: string | null; name: string | null } {
	return {
		personId: evaluator.kind === 'person' ? evaluator.personId || null : null,
		name: evaluator.kind === 'external' ? evaluator.name.trim() || null : null
	};
}

/** The unit's people as an evaluator picker lists them, by last then first name. */
export function rosterOptions(personnel: readonly PersonnelLookup[]): { value: string; label: string }[] {
	return [...personnel]
		.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
		.map((person) => ({ value: person.id, label: `${person.rank} ${person.lastName}, ${person.firstName}` }));
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

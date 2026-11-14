import { fail } from '$lib/errors';

export const EVALUATION_GONE = 'Evaluation not found';
export const RATING_SCHEME_GONE = 'Rating scheme not found';
export const EVALUATION_MOVED = 'This evaluation has changed since you opened it. Refresh it and try again.';
export const RATING_SCHEME_TAKEN = 'This person already has a rating scheme';
export const COMPLETED_REPORT_KEPT = 'Reopen this evaluation to change its report or period';
const EVALUATION_DENIED = 'You do not have permission to update this evaluation';
const EVALUATOR_OUTSIDE = 'Evaluators must belong to this Organization';

/** 55000 refusals that name a rule the user can act on, rather than a step that moved since they looked. */
const RULE_REFUSALS = new Set([
	'Another evaluation is already open on this rating scheme',
	'The rating scheme is archived',
	'Change the rater of an open evaluation with Change rater',
	COMPLETED_REPORT_KEPT
]);

/** The lifecycle functions and table triggers raise these codes; their 22023 messages are written for the user. */
export function lifecycleFailure(error: { code?: string; message: string }): never {
	switch (error.code) {
		case '42501':
			return fail(403, EVALUATION_DENIED);
		case '55000':
			return fail(409, RULE_REFUSALS.has(error.message) ? error.message : EVALUATION_MOVED);
		case 'P0002':
			return fail(404, error.message === RATING_SCHEME_GONE ? RATING_SCHEME_GONE : EVALUATION_GONE);
		case '23505':
			return fail(409, RATING_SCHEME_TAKEN);
		case '23503':
			return fail(400, EVALUATOR_OUTSIDE);
		case '22023':
			return fail(400, error.message);
		default:
			throw new Error(error.message);
	}
}

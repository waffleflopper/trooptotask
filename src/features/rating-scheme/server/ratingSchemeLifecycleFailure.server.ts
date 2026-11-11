import { fail } from '$lib/errors';

export const EVALUATION_GONE = 'Rating Scheme entry not found';
export const EVALUATION_MOVED = 'This evaluation has changed since you opened it. Refresh it and try again.';
const EVALUATION_DENIED = 'You do not have permission to update this evaluation';
const EVALUATOR_OUTSIDE = 'Evaluators must belong to this Organization';

/** The lifecycle functions raise these codes; their 22023 messages are written for the user. */
export function lifecycleFailure(error: { code?: string; message: string }): never {
	switch (error.code) {
		case '42501':
			return fail(403, EVALUATION_DENIED);
		case '55000':
			return fail(409, EVALUATION_MOVED);
		case 'P0002':
			return fail(404, EVALUATION_GONE);
		case '23503':
			return fail(400, EVALUATOR_OUTSIDE);
		case '22023':
			return fail(400, error.message);
		default:
			throw new Error(error.message);
	}
}

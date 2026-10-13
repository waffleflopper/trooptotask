const SAVED_STATES = ['started', 'pending', 'complete', 'failed', 'expired', 'unavailable'] as const;

// A reconciliation reply names the saved outcome; only an unrecognized one is unknown.
export function reconciledPasswordState(payload: unknown): (typeof SAVED_STATES)[number] {
	const state = payload && typeof payload === 'object' && 'state' in payload ? payload.state : null;
	return SAVED_STATES.find((saved) => saved === state) ?? 'started';
}

export function hasPendingPasswordCompletion(response: Response, payload: unknown): boolean {
	return (
		response.status === 202 &&
		!!payload &&
		typeof payload === 'object' &&
		'ok' in payload &&
		payload.ok === false &&
		'passwordUpdated' in payload &&
		payload.passwordUpdated === true &&
		'code' in payload &&
		payload.code === 'session_revocation_pending'
	);
}

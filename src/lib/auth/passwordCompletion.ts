export type PasswordCompletionState = 'started' | 'failed' | 'pending' | 'complete' | 'expired' | 'unavailable' | null;

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

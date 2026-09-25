// Identity facts admitted by the server hook, never supplied by request input.
export interface AdmittedActor {
	readonly userId: string;
}

export type PendingAuthFlow = 'recovery' | 'invite' | null;

export { sanitizeAuthNextPath } from './redirects';

export interface MfaStatus {
	currentLevel: 'aal1' | 'aal2';
	nextLevel: 'aal1' | 'aal2';
}

export type MfaChallengeResponse = { ok: true; error?: never } | { ok?: never; error: string };

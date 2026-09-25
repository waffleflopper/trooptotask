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

export type MfaActionResponse = { ok: true; error?: never } | { ok?: never; error: string };

export interface UserProfile {
	userId: string;
	firstName: string;
	lastName: string;
	rank: string;
}

export interface CurrentUserEmailConfirmation {
	status: 'confirmed' | 'unconfirmed' | 'unavailable';
	email: string | null;
}

export interface AccountSecurityOverview {
	hasMFA: boolean | null;
	currentEmail: string;
	pendingEmail: string | null;
}

import { resolve } from '$app/paths';

/** Two-factor setup that returns to this unit's Sign-in & security page. */
export function mfaSetupHref(orgUrlSegment: string): string {
	return resolve(`/auth/mfa-setup?${new URLSearchParams({ next: `/org/${orgUrlSegment}/account/security` })}`);
}

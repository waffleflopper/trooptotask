import { resolve } from '$app/paths';

/** Two-factor setup that returns to Sign-in & security, in this unit or in the standalone account. */
export function mfaSetupHref(orgUrlSegment?: string): string {
	const next = orgUrlSegment ? `/org/${orgUrlSegment}/account/security` : '/account/security';
	return resolve(`/auth/mfa-setup?${new URLSearchParams({ next })}`);
}

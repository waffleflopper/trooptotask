import { isPublicRoute } from './publicRoutes';
import type { Cookies } from '@sveltejs/kit';

type AssuranceLevelState = {
	currentLevel?: string | null;
	nextLevel?: string | null;
};

export type PendingAuthFlow = 'recovery' | 'invite' | null;

const AUTH_FLOW_COOKIE = 'ttt_pending_auth_flow';

const pendingFlowRoutes: Record<Exclude<PendingAuthFlow, null>, string[]> = {
	recovery: [
		'/auth/reset-password',
		'/api/auth/establish-session',
		'/api/auth/mfa/status',
		'/api/auth/mfa/verify',
		'/api/auth/update-password',
		'/auth/logout'
	],
	invite: [
		'/api/auth/mfa/status',
		'/api/auth/mfa/verify',
		'/auth/accept-invite',
		'/api/auth/establish-session',
		'/api/auth/update-password',
		'/api/auth/finalize-invite',
		'/auth/logout'
	]
};

export function isMfaStepUpRequired(assurance: AssuranceLevelState | null | undefined): boolean {
	return assurance?.currentLevel === 'aal1' && assurance?.nextLevel === 'aal2';
}

export function getPendingAuthFlowCookieName(): string {
	return AUTH_FLOW_COOKIE;
}

export function setPendingAuthFlowCookie(
	cookies: Pick<Cookies, 'set'>,
	authFlow: Exclude<PendingAuthFlow, null>
): void {
	cookies.set(AUTH_FLOW_COOKIE, authFlow, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !import.meta.env.DEV,
		maxAge: 60 * 60
	});
}

export function sanitizePendingAuthFlow(value: string | null | undefined): PendingAuthFlow {
	return value === 'recovery' || value === 'invite' ? value : null;
}

export function getAuthenticatedRedirectPath(authFlow: PendingAuthFlow, mfaPending: boolean): string {
	if (authFlow === 'recovery') return '/auth/reset-password';
	if (authFlow === 'invite') return '/auth/accept-invite';
	return mfaPending ? '/auth/mfa-verify' : '/dashboard';
}

export function getPublicPageUser<T>(user: T | null, mfaPending: boolean, authFlow: PendingAuthFlow): T | null {
	return authFlow || mfaPending ? null : user;
}

export function shouldRedirectIncompleteAuthSession(
	pathname: string,
	hasSession: boolean,
	mfaPending: boolean,
	authFlow: PendingAuthFlow
): boolean {
	if (!hasSession) return false;

	if (authFlow) {
		return !pendingFlowRoutes[authFlow].some((route) => pathname === route || pathname.startsWith(route + '/'));
	}

	return mfaPending && !isPublicRoute(pathname);
}

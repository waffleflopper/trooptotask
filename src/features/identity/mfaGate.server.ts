import { isPublicRoute } from './publicRoutes.server';
import type { Cookies } from '@sveltejs/kit';
import type { Session, User } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

type AssuranceLevelState = {
	currentLevel?: string | null;
	nextLevel?: string | null;
};

import type { PendingAuthFlow } from './contracts';

const AUTH_FLOW_COOKIE = 'ttt_pending_auth_flow';
const AUTH_FLOW_MAX_AGE_SECONDS = 60 * 60;
const COMPLETED_FLOW_MAX_AGE_SECONDS = 24 * 60 * 60;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FlowSession = Pick<Session, 'access_token'> & { user: Pick<User, 'id'> };
type FlowUser = Pick<User, 'id'>;
type AuthSessionMarker = Exclude<PendingAuthFlow, null> | 'complete';
type FlowMarker = {
	version: 1;
	flow: AuthSessionMarker;
	userId: string;
	sessionId: string;
	expiresAt: number;
};

function flowSecret(): string {
	const secret = env.ACCOUNT_SETUP_SESSION_SECRET ?? process.env.ACCOUNT_SETUP_SESSION_SECRET;
	if (secret) return secret;
	if (import.meta.env.DEV) return 'dev-account-setup-session-secret';
	throw new Error('ACCOUNT_SETUP_SESSION_SECRET is required for pending auth flows');
}

function flowSignature(payload: string): Buffer {
	return createHmac('sha256', flowSecret()).update('identity-pending-flow:v1:').update(payload).digest();
}

function sessionBinding(
	session: FlowSession,
	user: FlowUser
): { sessionId: string; passwordAuthenticated: boolean } | null {
	if (session.user?.id !== user.id) return null;
	try {
		const parts = session.access_token.split('.');
		if (parts.length !== 3) return null;
		const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
		if (claims.sub !== user.id || typeof claims.session_id !== 'string' || !SESSION_ID.test(claims.session_id))
			return null;
		return {
			sessionId: claims.session_id,
			passwordAuthenticated:
				Array.isArray(claims.amr) &&
				claims.amr.some((entry) => entry && typeof entry === 'object' && entry.method === 'password')
		};
	} catch {
		return null;
	}
}

const pendingFlowRoutes: Record<Exclude<PendingAuthFlow, null>, string[]> = {
	recovery: [
		'/auth/reset-password',
		'/api/auth/mfa/status',
		'/api/auth/mfa/verify',
		'/api/auth/update-password',
		'/auth/logout'
	],
	invite: [
		'/api/auth/mfa/status',
		'/api/auth/mfa/verify',
		'/auth/accept-invite',
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

export function isPasswordAuthenticatedSession(session: FlowSession, user: FlowUser): boolean {
	return sessionBinding(session, user)?.passwordAuthenticated === true;
}

function setAuthSessionMarker(
	cookies: Pick<Cookies, 'set'>,
	authFlow: AuthSessionMarker,
	session: FlowSession,
	user: FlowUser
): boolean {
	const binding = sessionBinding(session, user);
	if (!binding) return false;
	const maxAge = authFlow === 'complete' ? COMPLETED_FLOW_MAX_AGE_SECONDS : AUTH_FLOW_MAX_AGE_SECONDS;
	const marker: FlowMarker = {
		version: 1,
		flow: authFlow,
		userId: user.id,
		sessionId: binding.sessionId,
		expiresAt: Date.now() + maxAge * 1000
	};
	const payload = Buffer.from(JSON.stringify(marker)).toString('base64url');
	cookies.set(AUTH_FLOW_COOKIE, `${payload}.${flowSignature(payload).toString('base64url')}`, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !import.meta.env.DEV,
		maxAge
	});
	return true;
}

export function setPendingAuthFlowCookie(
	cookies: Pick<Cookies, 'set'>,
	authFlow: Exclude<PendingAuthFlow, null>,
	session: FlowSession,
	user: FlowUser
): boolean {
	return setAuthSessionMarker(cookies, authFlow, session, user);
}

export function setCompletedAuthFlowCookie(
	cookies: Pick<Cookies, 'set'>,
	session: FlowSession,
	user: FlowUser
): boolean {
	return setAuthSessionMarker(cookies, 'complete', session, user);
}

export function readAuthSessionMarker(
	cookies: Pick<Cookies, 'get'>,
	session: FlowSession,
	user: FlowUser
): AuthSessionMarker | null {
	const value = cookies.get(AUTH_FLOW_COOKIE);
	const binding = sessionBinding(session, user);
	if (!value || !binding) return null;
	const parts = value.split('.');
	if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
	try {
		const expected = flowSignature(parts[0]);
		const actual = Buffer.from(parts[1], 'base64url');
		if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
		const marker = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Partial<FlowMarker>;
		return marker.version === 1 &&
			(marker.flow === 'recovery' || marker.flow === 'invite' || marker.flow === 'complete') &&
			marker.userId === user.id &&
			marker.sessionId === binding.sessionId &&
			typeof marker.expiresAt === 'number' &&
			marker.expiresAt > Date.now()
			? marker.flow
			: null;
	} catch {
		return null;
	}
}

export function readPendingAuthFlowCookie(
	cookies: Pick<Cookies, 'get'>,
	session: FlowSession,
	user: FlowUser
): PendingAuthFlow {
	const marker = readAuthSessionMarker(cookies, session, user);
	return marker === 'complete' ? null : marker;
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

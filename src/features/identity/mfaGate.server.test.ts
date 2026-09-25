import { afterEach, describe, expect, it, vi } from 'vitest';
import { passwordSessionToken } from '../../tests/fixtures/passwordSession';
import {
	getAuthenticatedRedirectPath,
	getPendingAuthFlowCookieName,
	getPublicPageUser,
	isPasswordAuthenticatedSession,
	isMfaStepUpRequired,
	readAuthSessionMarker,
	readPendingAuthFlowCookie,
	setCompletedAuthFlowCookie,
	setPendingAuthFlowCookie,
	shouldRedirectIncompleteAuthSession
} from './mfaGate.server';

const user = { id: 'user-123' };
const session = { user, access_token: passwordSessionToken(user.id) };

function issuedMarker(flow: 'recovery' | 'invite'): string {
	let value = '';
	expect(setPendingAuthFlowCookie({ set: (_name, next) => (value = next) }, flow, session, user)).toBe(true);
	return value;
}

afterEach(() => vi.useRealTimers());

describe('mfaGate', () => {
	it('detects when an authenticated session still requires MFA step-up', () => {
		expect(isMfaStepUpRequired({ currentLevel: 'aal1', nextLevel: 'aal2' })).toBe(true);
		expect(isMfaStepUpRequired({ currentLevel: 'aal2', nextLevel: 'aal2' })).toBe(false);
		expect(isMfaStepUpRequired({ currentLevel: null, nextLevel: null })).toBe(false);
	});

	it('uses the MFA verification page as the redirect target while verification is pending', () => {
		expect(getAuthenticatedRedirectPath(null, true)).toBe('/auth/mfa-verify');
		expect(getAuthenticatedRedirectPath(null, false)).toBe('/dashboard');
		expect(getAuthenticatedRedirectPath('recovery', true)).toBe('/auth/reset-password');
		expect(getAuthenticatedRedirectPath('invite', false)).toBe('/auth/accept-invite');
	});

	it('does not expose a fully-authenticated user shape to public pages while MFA is pending', () => {
		expect(getPublicPageUser({ id: 'user-123' }, true, null)).toBeNull();
		expect(getPublicPageUser({ id: 'user-123' }, false, 'recovery')).toBeNull();
		expect(getPublicPageUser({ id: 'user-123' }, false, null)).toEqual({ id: 'user-123' });
	});

	it('accepts a confirmed flow only for its verified user and session', () => {
		expect(getPendingAuthFlowCookieName()).toBe('ttt_pending_auth_flow');
		for (const flow of ['recovery', 'invite'] as const) {
			const value = issuedMarker(flow);
			const cookies = { get: () => value };
			expect(readPendingAuthFlowCookie(cookies, session, user)).toBe(flow);
			expect(
				readPendingAuthFlowCookie(
					cookies,
					{
						user,
						access_token: passwordSessionToken(user.id, 'other', '00000000-0000-4000-8000-000000000002')
					},
					user
				)
			).toBeNull();
			expect(
				readPendingAuthFlowCookie(
					cookies,
					{ user: { id: 'other-user' }, access_token: passwordSessionToken('other-user') },
					{ id: 'other-user' }
				)
			).toBeNull();
		}
	});

	it('requires a password method or a verified completion marker for ordinary session authority', () => {
		const otpSession = { user, access_token: passwordSessionToken(user.id, 'otp', undefined, 'otp') };
		expect(isPasswordAuthenticatedSession(session, user)).toBe(true);
		expect(isPasswordAuthenticatedSession(otpSession, user)).toBe(false);
		let value = '';
		expect(setCompletedAuthFlowCookie({ set: (_name, next) => (value = next) }, otpSession, user)).toBe(true);
		expect(readAuthSessionMarker({ get: () => value }, otpSession, user)).toBe('complete');
		expect(readPendingAuthFlowCookie({ get: () => value }, otpSession, user)).toBeNull();
		expect(readAuthSessionMarker({ get: () => value }, session, user)).toBe('complete');
	});

	it('rejects forged, tampered, and expired flow markers', () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
		const value = issuedMarker('recovery');
		for (const forged of ['recovery', 'invite', `${value.slice(0, -1)}x`]) {
			expect(readPendingAuthFlowCookie({ get: () => forged }, session, user)).toBeNull();
		}
		vi.setSystemTime(new Date('2026-09-25T13:00:01Z'));
		expect(readPendingAuthFlowCookie({ get: () => value }, session, user)).toBeNull();
	});

	it('does not issue a flow marker for a mismatched provider session', () => {
		const cookies = { set: vi.fn() };
		expect(setPendingAuthFlowCookie(cookies, 'recovery', session, { id: 'other-user' })).toBe(false);
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('redirects incomplete auth sessions to the route that finishes them', () => {
		expect(shouldRedirectIncompleteAuthSession('/dashboard', true, true, null)).toBe(true);
		expect(shouldRedirectIncompleteAuthSession('/auth/login', true, true, null)).toBe(false);
		expect(shouldRedirectIncompleteAuthSession('/auth/login', true, false, 'recovery')).toBe(true);
		expect(shouldRedirectIncompleteAuthSession('/auth/reset-password', true, false, 'recovery')).toBe(false);
		expect(shouldRedirectIncompleteAuthSession('/auth/accept-invite', true, false, 'invite')).toBe(false);
		expect(shouldRedirectIncompleteAuthSession('/dashboard', true, false, 'invite')).toBe(true);
		expect(shouldRedirectIncompleteAuthSession('/dashboard', true, false, null)).toBe(false);
		expect(shouldRedirectIncompleteAuthSession('/dashboard', false, true, 'recovery')).toBe(false);
	});
});

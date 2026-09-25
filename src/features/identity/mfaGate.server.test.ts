import { describe, expect, it } from 'vitest';
import {
	getAuthenticatedRedirectPath,
	getPendingAuthFlowCookieName,
	getPublicPageUser,
	isMfaStepUpRequired,
	sanitizePendingAuthFlow,
	shouldRedirectIncompleteAuthSession
} from './mfaGate.server';

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

	it('normalizes the pending auth-flow cookie value', () => {
		expect(getPendingAuthFlowCookieName()).toBe('ttt_pending_auth_flow');
		expect(sanitizePendingAuthFlow('recovery')).toBe('recovery');
		expect(sanitizePendingAuthFlow('invite')).toBe('invite');
		expect(sanitizePendingAuthFlow('something-else')).toBeNull();
		expect(sanitizePendingAuthFlow(null)).toBeNull();
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

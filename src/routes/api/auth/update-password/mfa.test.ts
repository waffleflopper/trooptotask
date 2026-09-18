vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({ rpc: attemptStore.rpc }) }));
import { attemptStore } from '../../../../tests/fixtures/passwordAttempt';
import { passwordSessionToken } from '../../../../tests/fixtures/passwordSession';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const proof = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
	createClient: () => ({
		auth: {
			signInWithPassword: proof.signIn,
			getUser: async () => ({ data: { user: { id: 'actor' } }, error: null }),
			mfa: {
				getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
			},
			signOut: async () => ({ error: null }),
			admin: { signOut: async () => ({ error: null }) }
		}
	})
}));
vi.mock('$lib/server/passwordUpdateRateLimit', () => ({
	checkPasswordUpdateRateLimit: async () => ({ limited: false }),
	PASSWORD_UPDATE_RATE_LIMIT_MESSAGE: 'Limited',
	passwordUpdateRateLimitAuditDetails: () => ({})
}));
vi.mock('$lib/server/auditLog', () => ({ auditLog: vi.fn() }));
import { POST } from './+server';
const now = new Date('2026-09-17T12:00:00Z');
const user = { id: 'actor', email: 'actor@example.test' };
const assurance = (currentLevel = 'aal2', nextLevel = 'aal2') => ({ data: { currentLevel, nextLevel }, error: null });
function fixture(flow: null | 'recovery' | 'invite') {
	const session = {
		user,
		access_token: passwordSessionToken('actor', 'admitted-token'),
		expires_at: now.getTime() / 1000 + 60
	};
	const auth = {
		mfa: { getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue(assurance()) },
		updateUser: vi.fn().mockResolvedValue({ data: { user: user }, error: null }),
		admin: { signOut: vi.fn().mockResolvedValue({ error: null }) }
	};
	const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
	const event = () =>
		({
			request: new Request('https://app.invalid/api/auth/update-password', {
				method: 'POST',
				body: JSON.stringify({
					currentPassword: 'OldPassword12',
					password: 'NewPassword12',
					confirmPassword: 'NewPassword12'
				})
			}),
			locals: { user, session, supabase: { auth }, authFlow: flow, mfaPending: false },
			cookies,
			getClientAddress: () => '192.0.2.1'
		}) as unknown as Parameters<typeof POST>[0];
	const denied = () => {
		expect(auth.updateUser).not.toHaveBeenCalled();
		expect(auth.admin.signOut).not.toHaveBeenCalled();
		expect(cookies.set).not.toHaveBeenCalled();
		expect(cookies.delete).not.toHaveBeenCalled();
	};
	return { session, auth, cookies, event, denied };
}
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(now);
	proof.signIn.mockReset().mockResolvedValue({
		data: {
			user,
			session: {
				user,
				access_token: 'proof-token',
				refresh_token: 'proof-refresh',
				expires_at: now.getTime() / 1000 + 60
			}
		},
		error: null
	});
});
afterEach(() => vi.useRealTimers());
describe.each([null, 'recovery', 'invite'] as const)('mutation MFA for %s', (flow) => {
	it.each([
		undefined,
		null,
		{},
		{ error: null },
		{ ...assurance(), error: { message: 'private' } },
		{ data: { currentLevel: 'unknown', nextLevel: 'aal2' }, error: null },
		{ data: { currentLevel: 'aal2', nextLevel: null }, error: null }
	])('denies unavailable assurance %# without effects', async (result) => {
		const h = fixture(flow);
		h.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce(result);
		const response = await POST(h.event());
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('private');
		h.denied();
	});
	it('contains provider exceptions and retries with fresh assurance', async () => {
		const h = fixture(flow);
		h.auth.mfa.getAuthenticatorAssuranceLevel.mockRejectedValueOnce(new Error('private'));
		expect((await POST(h.event())).status).toBe(503);
		h.denied();
		expect((await POST(h.event())).status).toBe(200);
	});
	it('denies pending MFA despite stale hook admission, then accepts upgraded token without a proof loop', async () => {
		const h = fixture(flow);
		h.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce(assurance('aal1', 'aal2'));
		const response = await POST(h.event());
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: 'mfa_required' });
		h.denied();
		h.session.access_token = passwordSessionToken('actor', 'upgraded-token');
		expect((await POST(h.event())).status).toBe(200);
		expect(h.auth.mfa.getAuthenticatorAssuranceLevel).toHaveBeenNthCalledWith(
			1,
			passwordSessionToken('actor', 'admitted-token')
		);
		expect(h.auth.mfa.getAuthenticatorAssuranceLevel).toHaveBeenNthCalledWith(
			2,
			passwordSessionToken('actor', 'upgraded-token')
		);
		expect(h.auth.updateUser).toHaveBeenCalledExactlyOnceWith({
			password: 'NewPassword12',
			data: { ttt_password_attempt: '00000000-0000-4000-8000-000000000099' }
		});
	});
	it('denies expiry while assurance is read', async () => {
		const h = fixture(flow);
		h.auth.mfa.getAuthenticatorAssuranceLevel.mockImplementationOnce(async () => {
			vi.setSystemTime(new Date(now.getTime() + 60000));
			return assurance();
		});
		expect((await POST(h.event())).status).toBe(401);
		h.denied();
	});
	it.each([
		['aal1', 'aal1'],
		['aal2', 'aal2'],
		['aal2', 'aal1']
	])('allows recognized complete assurance %s/%s', async (current, next) => {
		const h = fixture(flow);
		h.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce(assurance(current, next));
		expect((await POST(h.event())).status).toBe(200);
		expect(h.cookies.set).not.toHaveBeenCalled();
		if (flow === 'invite') expect(h.cookies.delete).not.toHaveBeenCalled();
	});
});

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { passwordSessionToken } from '../../../../tests/fixtures/passwordSession';
import { passwordCompletionState, PASSWORD_COMPLETION_COOKIE } from '$lib/server/passwordCompletion';
import { POST } from './+server';
vi.mock('$env/dynamic/private', () => ({ env: { ACCOUNT_SETUP_SESSION_SECRET: 'synthetic-receipt-secret' } }));
vi.mock('$lib/server/passwordUpdateRateLimit', () => ({
	checkPasswordUpdateRateLimit: async () => ({ limited: false }),
	PASSWORD_UPDATE_RATE_LIMIT_MESSAGE: 'Limited',
	passwordUpdateRateLimitAuditDetails: () => ({})
}));
vi.mock('$lib/server/auditLog', () => ({ auditLog: vi.fn() }));
function fixture(flow: 'recovery' | 'invite' = 'recovery') {
	const user = { id: 'actor', email: 'actor@example.test' };
	const auth = {
		updateUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
		admin: { signOut: vi.fn().mockResolvedValue({ error: null }) },
		mfa: {
			getAuthenticatorAssuranceLevel: vi
				.fn()
				.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
		}
	};
	const locals = {
		user,
		session: { user, access_token: passwordSessionToken(user.id), expires_at: Date.now() / 1000 + 60 },
		authFlow: flow as 'recovery' | 'invite' | null,
		supabase: { auth }
	};
	const jar = new Map<string, string>();
	const cookies = {
		get: (name: string) => jar.get(name),
		set: vi.fn((name: string, value: string) => {
			jar.set(name, value);
		}),
		delete: vi.fn((name: string) => {
			jar.delete(name);
		})
	};
	const event = (body: unknown = { password: 'NewPassword12' }) =>
		({
			request: new Request('https://app.invalid/api/auth/update-password', {
				method: 'POST',
				body: JSON.stringify(body)
			}),
			locals,
			cookies,
			getClientAddress: () => '192.0.2.1'
		}) as unknown as Parameters<typeof POST>[0];
	const state = () => passwordCompletionState(cookies, locals as unknown as App.Locals);
	return { auth, locals, jar, cookies, event, state };
}
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());
it.each([undefined, null, {}, { error: undefined }, { error: false }, { error: { message: 'private' } }])(
	'retains confirmed mutation and retries only revocation for result %#',
	async (result) => {
		const h = fixture();
		h.auth.admin.signOut.mockResolvedValueOnce(result);
		const partial = await POST(h.event());
		expect(partial.status).toBe(202);
		expect(await partial.json()).toMatchObject({
			ok: false,
			passwordUpdated: true,
			code: 'session_revocation_pending'
		});
		expect(h.cookies.delete).not.toHaveBeenCalled();
		expect(h.state()).toBe('pending');
		expect(h.cookies.set.mock.calls[0][1]).not.toContain('NewPassword12');
		const retry = await POST(h.event({ action: 'complete' }));
		expect(await retry.json()).toEqual({ ok: true });
		expect(h.auth.updateUser).toHaveBeenCalledOnce();
		expect(h.state()).toBe('complete');
		expect(h.cookies.delete).toHaveBeenCalledWith('ttt_pending_auth_flow', { path: '/' });
		h.locals.authFlow = null;
		const replay = await POST(h.event({ password: 'DifferentPassword12' }));
		expect(await replay.json()).toEqual({ ok: true });
		expect(h.auth.updateUser).toHaveBeenCalledOnce();
		expect(h.auth.admin.signOut).toHaveBeenCalledTimes(2);
	}
);
it('contains revocation exceptions and retains the same receipt through a fresh request', async () => {
	const h = fixture();
	h.auth.admin.signOut.mockRejectedValueOnce(Error('private credentials'));
	expect(await (await POST(h.event())).text()).not.toContain('private');
	expect(h.state()).toBe('pending');
	expect((await POST(h.event({ action: 'complete' }))).status).toBe(200);
	expect(h.auth.updateUser).toHaveBeenCalledOnce();
});
it('requires fresh MFA on continuation and accepts the upgraded token for the same session', async () => {
	const h = fixture();
	h.auth.admin.signOut.mockResolvedValueOnce({ error: { message: 'outage' } });
	await POST(h.event());
	h.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({
		data: { currentLevel: 'aal1', nextLevel: 'aal2' },
		error: null
	});
	expect((await POST(h.event({ action: 'complete' }))).status).toBe(403);
	expect(h.auth.admin.signOut).toHaveBeenCalledOnce();
	h.locals.session.access_token = passwordSessionToken('actor', 'upgraded');
	expect((await POST(h.event({ action: 'complete' }))).status).toBe(200);
	expect(h.auth.updateUser).toHaveBeenCalledOnce();
});
it.each(['tamper', 'expired', 'wrong flow'] as const)('blocks %s without restarting mutation', async (failure) => {
	const h = fixture();
	h.auth.admin.signOut.mockResolvedValueOnce({ error: { message: 'outage' } });
	await POST(h.event());
	if (failure === 'tamper') h.jar.set(PASSWORD_COMPLETION_COOKIE, h.jar.get(PASSWORD_COMPLETION_COOKIE)! + 'x');
	if (failure === 'expired') {
		vi.setSystemTime(new Date('2026-09-17T12:01:00Z'));
		h.locals.session.expires_at += 60;
	}
	if (failure === 'wrong flow') h.locals.authFlow = 'invite';
	expect((await POST(h.event())).status).toBe(409);
	expect(h.auth.updateUser).toHaveBeenCalledOnce();
	expect(h.auth.admin.signOut).toHaveBeenCalledOnce();
	expect(h.cookies.delete).not.toHaveBeenCalled();
});
it.each(['actor', 'session'] as const)('does not grant completion to another %s', async (changed) => {
	const h = fixture();
	h.auth.admin.signOut.mockResolvedValueOnce({ error: { message: 'outage' } });
	await POST(h.event());
	if (changed === 'actor') {
		h.locals.user.id = 'other';
		h.locals.session.access_token = passwordSessionToken('other');
	} else h.locals.session.access_token = passwordSessionToken('actor', 'other', '00000000-0000-4000-8000-000000000002');
	expect(h.state()).toBeNull();
	expect((await POST(h.event({ action: 'complete' }))).status).toBe(409);
	expect(h.auth.admin.signOut).toHaveBeenCalledOnce();
	expect(h.auth.updateUser).toHaveBeenCalledOnce();
});
it('only allows an explicit fresh start after completion outside a pending auth flow', async () => {
	const h = fixture('invite');
	h.auth.admin.signOut.mockResolvedValueOnce({ error: { message: 'outage' } });
	await POST(h.event());
	expect((await POST(h.event({ action: 'restart' }))).status).toBe(409);
	await POST(h.event({ action: 'complete' }));
	expect((await POST(h.event({ action: 'restart' }))).status).toBe(409);
	h.locals.authFlow = null;
	expect((await POST(h.event({ action: 'restart' }))).status).toBe(200);
	expect(h.state()).toBeNull();
	expect(h.auth.updateUser).toHaveBeenCalledOnce();
});

it('does not revoke if the receipt expires while fresh assurance is checked', async () => {
	const h = fixture();
	h.auth.admin.signOut.mockResolvedValueOnce({ error: { message: 'outage' } });
	await POST(h.event());
	h.locals.session.expires_at += 120;
	h.auth.mfa.getAuthenticatorAssuranceLevel.mockImplementationOnce(async () => {
		vi.setSystemTime(new Date('2026-09-17T12:01:00Z'));
		return { data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null };
	});
	expect((await POST(h.event({ action: 'complete' }))).status).toBe(409);
	expect(h.auth.admin.signOut).toHaveBeenCalledOnce();
	expect(h.auth.updateUser).toHaveBeenCalledOnce();
});
it('records a confirmed password without attempting revocation after expiry during mutation', async () => {
	const h = fixture();
	h.auth.updateUser.mockImplementationOnce(async () => {
		vi.setSystemTime(new Date('2026-09-17T12:01:00Z'));
		return { data: { user: h.locals.user }, error: null };
	});
	const response = await POST(h.event());
	expect(response.status).toBe(202);
	expect(h.auth.admin.signOut).not.toHaveBeenCalled();
	expect(h.state()).toBe('expired');
	expect(h.cookies.delete).not.toHaveBeenCalled();
});

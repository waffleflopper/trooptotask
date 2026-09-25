vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({ rpc: attemptStore.rpc }) }));
import { attemptStore } from '../../../../tests/fixtures/passwordAttempt';
import { passwordSessionToken } from '../../../../tests/fixtures/passwordSession';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const provider = vi.hoisted(() => ({ signIn: vi.fn(), assurance: vi.fn(), identity: vi.fn(), revoke: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
	createClient: () => ({
		auth: {
			signInWithPassword: provider.signIn,
			getUser: provider.identity,
			mfa: { getAuthenticatorAssuranceLevel: provider.assurance },
			signOut: provider.revoke,
			admin: { signOut: provider.revoke }
		}
	})
}));
vi.mock('$features/identity/passwordUpdateRateLimit.server', () => ({
	checkPasswordUpdateRateLimit: async () => ({ limited: false })
}));
vi.mock('$lib/server/auditLog', () => ({ auditLog: vi.fn() }));
import { POST } from './+server';

const now = new Date('2026-09-17T12:00:00Z');
const user = { id: 'actor', email: 'actor@example.test' };
const valid = () => ({
	data: {
		user,
		session: {
			user,
			access_token: 'proof-access',
			refresh_token: 'proof-refresh',
			expires_at: now.getTime() / 1000 + 60
		}
	},
	error: null
});
function fixture() {
	const auth = {
		mfa: {
			getAuthenticatorAssuranceLevel: vi
				.fn()
				.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
		},
		signInWithPassword: provider.signIn,
		updateUser: vi.fn().mockResolvedValue({ data: { user: user }, error: null }),
		admin: { signOut: vi.fn().mockResolvedValue({ error: null }) }
	};
	const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
	const session = {
		user,
		access_token: passwordSessionToken('actor', 'admitted-access'),
		expires_at: now.getTime() / 1000 + 120
	};
	const event = () =>
		({
			request: new Request('https://app.invalid/api/auth/update-password', {
				method: 'POST',
				body: JSON.stringify({
					currentPassword: ' OldPassword12 ',
					password: ' NewPassword12 ',
					confirmPassword: ' NewPassword12 ',
					email: 'other@example.test'
				})
			}),
			locals: { user, session, supabase: { auth }, mfaPending: false },
			cookies,
			getClientAddress: () => '192.0.2.1'
		}) as unknown as Parameters<typeof POST>[0];
	const denied = () => {
		expect(auth.updateUser).not.toHaveBeenCalled();
		expect(auth.admin.signOut).not.toHaveBeenCalled();
		expect(cookies.set).not.toHaveBeenCalled();
		expect(cookies.delete).not.toHaveBeenCalled();
	};
	return { auth, cookies, session, event, denied };
}
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(now);
	provider.signIn.mockReset().mockResolvedValue(valid());
	provider.assurance.mockReset().mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
	provider.identity.mockReset().mockResolvedValue({ data: { user }, error: null });
	provider.revoke.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => vi.useRealTimers());

describe('password proof before mutation', () => {
	it.each([
		undefined,
		null,
		{},
		{ error: null },
		{ data: null, error: null },
		{ ...valid(), error: { status: 500, message: 'private provider detail' } },
		{ ...valid(), error: undefined },
		{ ...valid(), data: { ...valid().data, user: { id: 'other' } } },
		{ ...valid(), data: { ...valid().data, session: { ...valid().data.session, user: { id: 'other' } } } }
	])('rejects malformed or unbound proof %#', async (result) => {
		provider.signIn.mockResolvedValueOnce(result);
		const h = fixture();
		const response = await POST(h.event());
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('private');
		h.denied();
	});
	it.each([
		['access_token', ''],
		['access_token', 'has whitespace'],
		['access_token', 123],
		['refresh_token', ''],
		['refresh_token', null],
		['refresh_token', 'has whitespace'],
		['expires_at', undefined],
		['expires_at', '4102444800'],
		['expires_at', NaN],
		['expires_at', Infinity],
		['expires_at', now.getTime() / 1000]
	])('rejects unusable issued %s: %s', async (field, value) => {
		const result = valid();
		Object.assign(result.data.session, { [field]: value });
		provider.signIn.mockResolvedValueOnce(result);
		const h = fixture();
		expect((await POST(h.event())).status).toBe(503);
		h.denied();
	});
	it.each([
		undefined,
		null,
		{},
		{ error: null },
		{ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: { message: 'private' } },
		{ data: { currentLevel: null, nextLevel: 'aal1' }, error: null },
		{ data: { currentLevel: 'aal1', nextLevel: 'unknown' }, error: null }
	])('rejects unavailable proof assurance %#', async (result) => {
		provider.assurance.mockResolvedValueOnce(result);
		const h = fixture();
		expect((await POST(h.event())).status).toBe(503);
		h.denied();
		expect(provider.revoke).toHaveBeenCalledWith('proof-access', 'local');
	});
	it.each(['signIn', 'identity', 'assurance', 'revoke'] as const)(
		'contains thrown %s failures and permits independent retry',
		async (operation) => {
			provider[operation].mockRejectedValueOnce(new Error('private credentials'));
			const h = fixture();
			const response = await POST(h.event());
			expect(response.status).toBe(503);
			expect(await response.text()).not.toContain('private');
			h.denied();
			expect((await POST(h.event())).status).toBe(200);
			expect(h.auth.updateUser).toHaveBeenCalledExactlyOnceWith({
				password: ' NewPassword12 ',
				data: { ttt_password_attempt: '00000000-0000-4000-8000-000000000099' }
			});
		}
	);
	it.each([
		undefined,
		null,
		{},
		{ error: null },
		{ data: { user: { id: 'other' } }, error: null },
		{ data: { user }, error: { message: 'private' } }
	])('rejects unverified token identity %#', async (result) => {
		provider.identity.mockResolvedValueOnce(result);
		const h = fixture();
		expect((await POST(h.event())).status).toBe(503);
		h.denied();
	});
	it.each([undefined, null, {}, { error: { message: 'private' } }])(
		'does not mutate when proof-session cleanup is unconfirmed %#',
		async (result) => {
			provider.revoke.mockResolvedValueOnce(result);
			const h = fixture();
			expect((await POST(h.event())).status).toBe(503);
			h.denied();
		}
	);
	it('rejects incorrect credentials without replacing the admitted session, then permits retry', async () => {
		provider.signIn.mockResolvedValueOnce({ data: null, error: { status: 400, message: 'private' } });
		const h = fixture();
		expect((await POST(h.event())).status).toBe(401);
		h.denied();
		expect((await POST(h.event())).status).toBe(200);
	});
	it.each(['proof', 'admitted', 'cleanup'])('denies %s expiry during asynchronous proof', async (kind) => {
		const h = fixture();
		if (kind === 'admitted') h.session.expires_at = now.getTime() / 1000 + 30;
		const clock = async () => {
			vi.setSystemTime(new Date(now.getTime() + (kind === 'admitted' ? 30 : 60) * 1000));
			return { data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null };
		};
		if (kind === 'cleanup')
			provider.revoke.mockImplementationOnce(async () => {
				await clock();
				return { error: null };
			});
		else provider.assurance.mockImplementationOnce(clock);
		expect((await POST(h.event())).status).toBe(kind === 'admitted' ? 401 : 503);
		h.denied();
	});
	it.each([
		['aal1', 'aal1'],
		['aal1', 'aal2'],
		['aal2', 'aal2']
	])('validates %s/%s proof without replacing current session assurance', async (currentLevel, nextLevel) => {
		provider.assurance.mockResolvedValueOnce({ data: { currentLevel, nextLevel }, error: null });
		const h = fixture();
		expect((await POST(h.event())).status).toBe(200);
		expect(provider.signIn).toHaveBeenCalledWith({ email: user.email, password: ' OldPassword12 ' });
		expect(provider.identity).toHaveBeenCalledWith('proof-access');
		expect(provider.assurance).toHaveBeenCalledWith('proof-access');
		expect(provider.revoke).toHaveBeenCalledWith('proof-access', 'local');
		expect(h.auth.updateUser).toHaveBeenCalledExactlyOnceWith({
			password: ' NewPassword12 ',
			data: { ttt_password_attempt: '00000000-0000-4000-8000-000000000099' }
		});
		expect(h.session.access_token).toBe(passwordSessionToken('actor', 'admitted-access'));
		expect(h.cookies.set).not.toHaveBeenCalled();
	});
});

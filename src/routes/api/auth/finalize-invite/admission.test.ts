import { passwordSessionToken } from '../../../../tests/fixtures/passwordSession';
vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({ rpc: attemptStore.rpc }) }));
import { attemptStore } from '../../../../tests/fixtures/passwordAttempt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const effects = vi.hoisted(() => ({ profile: vi.fn(), accept: vi.fn() }));
vi.mock('$lib/server/auto-accept-org-invites', () => ({ autoAcceptOrgInvites: effects.accept }));
vi.mock('$lib/server/userProfile', async (original) => ({
	...(await original<typeof import('$lib/server/userProfile')>()),
	upsertCurrentUserProfile: effects.profile
}));
import { POST } from './+server';
const now = new Date('2026-09-18T05:00:00Z');
const assurance = (currentLevel = 'aal2', nextLevel = 'aal2') => ({ data: { currentLevel, nextLevel }, error: null });
function fixture() {
	const user = {
		id: 'verified-actor',
		email: 'verified@example.test',
		user_metadata: { firstName: 'Jane', lastName: 'Smith', rank: 'SGT' }
	};
	attemptStore.row = {
		actor: user.id,
		session: '00000000-0000-4000-8000-000000000001',
		id: '00000000-0000-4000-8000-000000000099',
		flow: 'invite',
		state: 'complete',
		expiresAt: now.getTime() / 1000 + 60,
		acquired: false
	};
	const session = { user, access_token: passwordSessionToken('verified-actor'), expires_at: now.getTime() / 1000 + 60 };
	const readAssurance = vi.fn().mockResolvedValue(assurance());
	const locals = {
		user,
		session,
		authFlow: 'invite' as string | null,
		mfaPending: false,
		supabase: { auth: { mfa: { getAuthenticatorAssuranceLevel: readAssurance } } }
	};
	const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
	const event = () =>
		({
			locals,
			cookies,
			request: new Request('https://app.invalid/api/auth/finalize-invite', {
				method: 'POST',
				body: JSON.stringify({ userId: 'other', email: 'other@example.test', authFlow: 'invite' })
			})
		}) as unknown as Parameters<typeof POST>[0];
	const denied = () => {
		expect(effects.profile).not.toHaveBeenCalled();
		expect(effects.accept).not.toHaveBeenCalled();
		expect(cookies.set).not.toHaveBeenCalled();
		expect(cookies.delete).not.toHaveBeenCalled();
	};
	return { locals, cookies, readAssurance, event, denied };
}
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(now);
	effects.profile.mockReset().mockResolvedValue(undefined);
	effects.accept.mockReset().mockResolvedValue({ accepted: 1 });
});
afterEach(() => vi.useRealTimers());
describe('invite finalization request admission', () => {
	it.each([
		['no verified user', { user: null }],
		['no session', { session: null }],
		['wrong actor', { session: { user: { id: 'other' }, access_token: 'token', expires_at: 4102444800 } }],
		['missing actor ID', { user: { email: 'verified@example.test' } }],
		['missing email', { user: { id: 'verified-actor' } }],
		['invalid email type', { user: { id: 'verified-actor', email: 123 } }]
	])('denies %s before effects', async (_label, patch) => {
		const h = fixture();
		Object.assign(h.locals, patch);
		expect((await POST(h.event())).status).toBe(401);
		h.denied();
	});
	it.each([
		['access_token', ''],
		['access_token', ' whitespace '],
		['access_token', 123],
		['expires_at', undefined],
		['expires_at', '4102444800'],
		['expires_at', NaN],
		['expires_at', Infinity],
		['expires_at', now.getTime() / 1000]
	])('denies unusable %s: %s', async (field, value) => {
		const h = fixture();
		Object.assign(h.locals.session, { [field]: value });
		expect((await POST(h.event())).status).toBe(401);
		h.denied();
	});
	it.each([null, 'recovery'])('rejects %s flow even with spoofed invite body', async (flow) => {
		const h = fixture();
		h.locals.authFlow = flow;
		expect((await POST(h.event())).status).toBe(403);
		h.denied();
	});
	it.each([
		undefined,
		null,
		{},
		{ error: null },
		{ ...assurance(), error: { message: 'private' } },
		{ data: { currentLevel: 'unknown', nextLevel: 'aal2' }, error: null },
		{ data: { currentLevel: 'aal2', nextLevel: null }, error: null }
	])('denies unavailable assurance %#', async (result) => {
		const h = fixture();
		h.readAssurance.mockResolvedValueOnce(result);
		const response = await POST(h.event());
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('private');
		h.denied();
	});
	it('contains thrown assurance failures and permits a fresh retry', async () => {
		const h = fixture();
		h.readAssurance.mockRejectedValueOnce(new Error('private'));
		const response = await POST(h.event());
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('private');
		h.denied();
		expect((await POST(h.event())).status).toBe(200);
	});
	it('denies pending MFA despite stale hook admission and finalizes only with the upgraded token', async () => {
		const h = fixture();
		h.readAssurance.mockResolvedValueOnce(assurance('aal1', 'aal2'));
		const response = await POST(h.event());
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: 'mfa_required', activated: false });
		h.denied();
		h.locals.session.access_token = passwordSessionToken('verified-actor', 'upgraded');
		expect((await POST(h.event())).status).toBe(200);
		expect(h.readAssurance).toHaveBeenNthCalledWith(1, passwordSessionToken('verified-actor'));
		expect(h.readAssurance).toHaveBeenNthCalledWith(2, passwordSessionToken('verified-actor', 'upgraded'));
		expect(effects.accept).toHaveBeenCalledExactlyOnceWith(h.locals.supabase, 'verified@example.test');
	});
	it('denies expiry during assurance before profile/membership/cookie effects', async () => {
		const h = fixture();
		h.readAssurance.mockImplementationOnce(async () => {
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
	])('allows complete assurance %s/%s and denies replay after the flow clears', async (current, next) => {
		const h = fixture();
		h.readAssurance.mockResolvedValue(assurance(current, next));
		expect((await POST(h.event())).status).toBe(200);
		expect(effects.profile).toHaveBeenCalledExactlyOnceWith(h.locals, {
			firstName: 'Jane',
			lastName: 'Smith',
			rank: 'SGT'
		});
		expect(effects.accept).toHaveBeenCalledExactlyOnceWith(h.locals.supabase, 'verified@example.test');
		expect(h.cookies.delete).toHaveBeenCalledExactlyOnceWith('ttt_pending_auth_flow', { path: '/' });
		h.locals.authFlow = null;
		expect((await POST(h.event())).status).toBe(403);
		expect(effects.accept).toHaveBeenCalledTimes(1);
	});
});

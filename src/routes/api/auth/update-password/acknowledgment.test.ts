vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({ rpc: attemptStore.rpc }) }));
import { attemptStore } from '../../../../tests/fixtures/passwordAttempt';
import { passwordSessionToken } from '../../../../tests/fixtures/passwordSession';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('$features/identity/passwordUpdateRateLimit.server', () => ({
	checkPasswordUpdateRateLimit: async () => ({ limited: false })
}));
vi.mock('$lib/server/auditLog', () => ({ auditLog: vi.fn() }));
import { POST } from './+server';
const user = { id: 'actor', email: 'actor@example.test' };
function fixture() {
	const auth = {
		mfa: {
			getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
		},
		updateUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
		admin: { signOut: vi.fn().mockResolvedValue({ error: null }) }
	};
	const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
	const event = () =>
		({
			request: new Request('https://app.invalid/api/auth/update-password', {
				method: 'POST',
				body: JSON.stringify({ password: 'NewPassword12' })
			}),
			locals: {
				user,
				session: {
					user,
					access_token: passwordSessionToken('actor', 'admitted-token'),
					expires_at: Date.now() / 1000 + 60
				},
				authFlow: 'recovery',
				supabase: { auth }
			},
			cookies,
			getClientAddress: () => '192.0.2.1'
		}) as unknown as Parameters<typeof POST>[0];
	return { auth, cookies, event };
}
afterEach(() => vi.restoreAllMocks());
it.each([
	undefined,
	null,
	{},
	{ error: null },
	{ data: null, error: null },
	{ data: { user: null }, error: null },
	{ data: { user: { id: 'other-actor' } }, error: null },
	{ data: { user }, error: undefined },
	{ data: { user }, error: { message: 'private provider detail', status: 500 } },
	{ data: { user }, error: false }
])('does not complete without a stored commit despite provider response %#', async (result) => {
	const h = fixture();
	attemptStore.committed = false;
	h.auth.updateUser.mockResolvedValueOnce(result);
	const response = await POST(h.event());
	expect(response.status).toBe(409);
	expect(await response.json()).toMatchObject({ code: 'password_reconciliation_required', state: 'failed' });
	expect(h.auth.admin.signOut).not.toHaveBeenCalled();
	expect(h.cookies.delete).not.toHaveBeenCalled();
});
it('contains a thrown mutation failure without logging credentials or performing completion effects', async () => {
	const h = fixture();
	attemptStore.committed = false;
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	h.auth.updateUser.mockRejectedValueOnce(new Error('private provider detail'));
	const response = await POST(h.event());
	expect(response.status).toBe(409);
	expect(await response.text()).not.toContain('private');
	expect(log).not.toHaveBeenCalled();
	expect(h.auth.admin.signOut).not.toHaveBeenCalled();
	expect(h.cookies.delete).not.toHaveBeenCalled();
});
it('keeps a rejected mutation retryable and completes only an acknowledged retry for the admitted actor', async () => {
	const h = fixture();
	attemptStore.committed = false;
	h.auth.updateUser.mockResolvedValueOnce({
		data: { user: null },
		error: { code: 'weak_password', message: 'private' }
	});
	const rejected = await POST(h.event());
	expect(rejected.status).toBe(409);
	expect(await rejected.text()).not.toContain('private');
	expect(h.auth.admin.signOut).not.toHaveBeenCalled();
	expect(h.cookies.delete).not.toHaveBeenCalled();
	const restart = h.event();
	restart.request = new Request('https://app.invalid/api/auth/update-password', {
		method: 'POST',
		body: JSON.stringify({ action: 'restart' })
	});
	expect((await POST(restart)).status).toBe(200);
	attemptStore.committed = true;
	const accepted = await POST(h.event());
	expect(accepted.status).toBe(200);
	expect(await accepted.json()).toEqual({ ok: true });
	expect(h.auth.admin.signOut).toHaveBeenCalledExactlyOnceWith(
		passwordSessionToken('actor', 'admitted-token'),
		'others'
	);
	expect(h.cookies.delete).toHaveBeenCalledOnce();
});

it('recovers a committed mutation despite a lost provider response and without receipt delivery', async () => {
	const h = fixture();
	attemptStore.committed = true;
	h.auth.updateUser.mockRejectedValueOnce(Error('lost response'));
	h.auth.admin.signOut.mockResolvedValueOnce({ error: { message: 'outage' } });
	expect((await POST(h.event())).status).toBe(202);
	expect(h.cookies.set).not.toHaveBeenCalled();
	const retry = h.event();
	retry.request = new Request('https://app.invalid/api/auth/update-password', {
		method: 'POST',
		body: JSON.stringify({ action: 'complete' })
	});
	expect((await POST(retry)).status).toBe(200);
	expect(h.auth.updateUser).toHaveBeenCalledOnce();
	expect(attemptStore.row?.state).toBe('complete');
});
it('serializes concurrent initial requests before the provider effect', async () => {
	const h = fixture();
	let release!: () => void;
	h.auth.updateUser.mockImplementationOnce(async () => {
		await new Promise<void>((resolve) => {
			release = resolve;
		});
		return { data: { user }, error: null };
	});
	const first = POST(h.event());
	await vi.waitFor(() => expect(h.auth.updateUser).toHaveBeenCalledOnce());
	const second = await POST(h.event());
	expect(second.status).toBe(409);
	expect(attemptStore.row?.state).toBe('started');
	release();
	expect((await first).status).toBe(200);
	expect(h.auth.updateUser).toHaveBeenCalledOnce();
});
it('refuses mutation when persistence is unavailable and preserves a committed result across completion-write failure', async () => {
	const h = fixture();
	attemptStore.unavailable = true;
	expect((await POST(h.event())).status).toBe(503);
	expect(h.auth.updateUser).not.toHaveBeenCalled();
	attemptStore.unavailable = false;
	h.auth.admin.signOut.mockImplementationOnce(async () => {
		attemptStore.unavailable = true;
		return { error: null };
	});
	expect((await POST(h.event())).status).toBe(503);
	expect(attemptStore.row?.state).toBe('pending');
	attemptStore.unavailable = false;
	expect((await POST(h.event())).status).toBe(200);
	expect(h.auth.updateUser).toHaveBeenCalledOnce();
});

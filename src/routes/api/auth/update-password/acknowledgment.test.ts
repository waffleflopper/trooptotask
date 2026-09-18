import { afterEach, expect, it, vi } from 'vitest';
vi.mock('$lib/server/passwordUpdateRateLimit', () => ({
	checkPasswordUpdateRateLimit: async () => ({ limited: false }),
	PASSWORD_UPDATE_RATE_LIMIT_MESSAGE: 'Limited',
	passwordUpdateRateLimitAuditDetails: () => ({})
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
		signOut: vi.fn().mockResolvedValue({ error: null })
	};
	const cookies = { delete: vi.fn() };
	const event = () =>
		({
			request: new Request('https://app.invalid/api/auth/update-password', {
				method: 'POST',
				body: JSON.stringify({ password: 'NewPassword12' })
			}),
			locals: {
				user,
				session: { user, access_token: 'admitted-token', expires_at: Date.now() / 1000 + 60 },
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
])('does not complete an unacknowledged mutation %#', async (result) => {
	const h = fixture();
	h.auth.updateUser.mockResolvedValueOnce(result);
	const response = await POST(h.event());
	expect(response.status).toBe(503);
	expect(await response.json()).toMatchObject({ code: 'password_update_unconfirmed' });
	expect(h.auth.signOut).not.toHaveBeenCalled();
	expect(h.cookies.delete).not.toHaveBeenCalled();
});
it('contains a thrown mutation failure without logging credentials or performing completion effects', async () => {
	const h = fixture();
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	h.auth.updateUser.mockRejectedValueOnce(new Error('private provider detail'));
	const response = await POST(h.event());
	expect(response.status).toBe(503);
	expect(await response.text()).not.toContain('private');
	expect(log).not.toHaveBeenCalled();
	expect(h.auth.signOut).not.toHaveBeenCalled();
	expect(h.cookies.delete).not.toHaveBeenCalled();
});
it('keeps a rejected mutation retryable and completes only an acknowledged retry for the admitted actor', async () => {
	const h = fixture();
	h.auth.updateUser.mockResolvedValueOnce({
		data: { user: null },
		error: { code: 'weak_password', message: 'private' }
	});
	const rejected = await POST(h.event());
	expect(rejected.status).toBe(400);
	expect(await rejected.text()).not.toContain('private');
	expect(h.auth.signOut).not.toHaveBeenCalled();
	expect(h.cookies.delete).not.toHaveBeenCalled();
	const accepted = await POST(h.event());
	expect(accepted.status).toBe(200);
	expect(await accepted.json()).toEqual({ ok: true });
	expect(h.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'others' });
	expect(h.cookies.delete).toHaveBeenCalledOnce();
});

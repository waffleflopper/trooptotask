import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const provider = vi.hoisted(() => ({
	signIn: vi.fn(),
	assurance: vi.fn(),
	identity: vi.fn(),
	revoke: vi.fn(),
	limit: vi.fn()
}));
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
vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({ rpc: provider.limit }) }));
import { actions } from './+page.server';
const POST = actions.updateEmail;

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
		signInWithPassword: vi.fn().mockResolvedValue(valid()),
		updateUser: vi.fn().mockResolvedValue({ data: { user: { ...user, new_email: 'new@example.test' } }, error: null }),
		admin: { signOut: vi.fn().mockResolvedValue({ error: null }) }
	};
	const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
	const session = {
		user,
		access_token: 'admitted-access',
		expires_at: now.getTime() / 1000 + 120
	};
	const event = () => {
		const body = new FormData();
		body.set('email', 'NEW@EXAMPLE.TEST');
		body.set('currentPassword', ' OldPassword12 ');
		return {
			request: new Request('https://app.invalid/account/security?/updateEmail', { method: 'POST', body }),
			locals: { actor: { userId: user.id }, user, session, supabase: { auth }, mfaPending: false },
			cookies,
			getClientAddress: () => '192.0.2.1'
		} as unknown as Parameters<typeof POST>[0];
	};
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
	provider.limit.mockReset().mockResolvedValue({ data: { limited: false, retry_after_ms: 0 }, error: null });
	provider.assurance.mockReset().mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
	provider.identity.mockReset().mockResolvedValue({ data: { user }, error: null });
	provider.revoke.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => vi.useRealTimers());

describe('email proof and completion', () => {
	it.each([
		null,
		{},
		{ error: null },
		{ ...valid(), data: { ...valid().data, user: { id: 'other' } } },
		{ ...valid(), error: { status: 500, message: 'private' } }
	])('rejects unavailable or unbound proof %#', async (result) => {
		provider.signIn.mockResolvedValueOnce(result);
		const h = fixture();
		expect(await POST(h.event())).toMatchObject({ status: 503 });
		h.denied();
	});
	it.each(['signIn', 'identity', 'assurance', 'revoke'] as const)(
		'contains %s failure and allows retry',
		async (operation) => {
			provider[operation].mockRejectedValueOnce(new Error('private token'));
			const h = fixture();
			const response = await POST(h.event());
			expect(response).toMatchObject({ status: 503 });
			expect(JSON.stringify(response)).not.toContain('private');
			h.denied();
			expect(await POST(h.event())).toMatchObject({
				emailSuccess: expect.any(String),
				pendingEmail: 'new@example.test'
			});
		}
	);
	it('denies incorrect password without request-session sign-in', async () => {
		provider.signIn.mockResolvedValueOnce({ data: null, error: { status: 400 } });
		const h = fixture();
		expect(await POST(h.event())).toMatchObject({ status: 401 });
		h.denied();
		expect(h.auth.signInWithPassword).not.toHaveBeenCalled();
	});
	it.each([
		null,
		{ error: null },
		{ data: { user: { id: 'other', new_email: 'new@example.test' } }, error: null },
		{ data: { user }, error: null },
		{ data: { user: { ...user, new_email: 'other@example.test' } }, error: null },
		{ data: { user: { ...user, new_email: 'new@example.test' } }, error: { message: 'private' } }
	])('does not claim confirmation from unacknowledged provider result %#', async (result) => {
		const h = fixture();
		h.auth.updateUser.mockResolvedValueOnce(result);
		const response = await POST(h.event());
		expect(response).toMatchObject({ status: 503 });
		expect(JSON.stringify(response)).not.toContain('private');
		expect(await POST(h.event())).toMatchObject({ pendingEmail: 'new@example.test' });
	});
	it.each([
		null,
		{ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: { message: 'private' } },
		{ data: { currentLevel: 'unknown', nextLevel: 'aal2' }, error: null }
	])('denies unavailable mutation assurance %#', async (result) => {
		const h = fixture();
		h.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce(result);
		expect(await POST(h.event())).toMatchObject({ status: 503 });
		h.denied();
	});
	it('requires fresh MFA on the admitted token without accepting proof AAL1', async () => {
		const h = fixture();
		h.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({
			data: { currentLevel: 'aal1', nextLevel: 'aal2' },
			error: null
		});
		expect(await POST(h.event())).toMatchObject({ status: 403, data: { code: 'mfa_required' } });
		h.denied();
		expect(h.auth.mfa.getAuthenticatorAssuranceLevel).toHaveBeenCalledWith('admitted-access');
		expect(await POST(h.event())).toMatchObject({ pendingEmail: 'new@example.test' });
		expect(h.auth.signInWithPassword).not.toHaveBeenCalled();
		expect(provider.signIn).toHaveBeenCalledWith({ email: user.email, password: ' OldPassword12 ' });
		expect(provider.revoke).toHaveBeenCalledWith('proof-access', 'local');
	});
	it.each(['before', 'proof', 'assurance'])('denies session expiry at %s', async (stage) => {
		const h = fixture();
		const expire = () => {
			vi.setSystemTime(new Date(now.getTime() + 120000));
		};
		if (stage === 'before') expire();
		if (stage === 'proof')
			provider.signIn.mockResolvedValueOnce({
				...valid(),
				data: { ...valid().data, session: { ...valid().data.session, expires_at: now.getTime() / 1000 + 600 } }
			});
		if (stage === 'proof')
			provider.revoke.mockImplementationOnce(async () => {
				expire();
				return { error: null };
			});
		if (stage === 'assurance')
			h.auth.mfa.getAuthenticatorAssuranceLevel.mockImplementationOnce(async () => {
				expire();
				return { data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null };
			});
		expect(await POST(h.event())).toMatchObject({ status: 401 });
		h.denied();
	});
	it.each(['limited', 'unavailable'])('denies %s durable limit before proof', async (kind) => {
		provider.limit.mockResolvedValueOnce(
			kind === 'limited'
				? { data: { limited: true, retry_after_ms: 5000 }, error: null }
				: { data: null, error: { message: 'private' } }
		);
		const h = fixture();
		expect(await POST(h.event())).toMatchObject({ status: kind === 'limited' ? 429 : 503 });
		h.denied();
		expect(provider.signIn).not.toHaveBeenCalled();
	});
});

it.each(['missing actor', 'wrong actor', 'missing session', 'wrong session actor', 'missing token', 'missing email'])(
	'denies %s before proof or mutation',
	async (kind) => {
		const h = fixture();
		const event = h.event();
		if (kind === 'missing actor') event.locals.actor = null;
		if (kind === 'wrong actor') event.locals.actor = { userId: 'other' };
		if (kind === 'missing session') event.locals.session = null;
		if (kind === 'wrong session actor')
			event.locals.session = { ...event.locals.session!, user: { ...event.locals.user!, id: 'other' } };
		if (kind === 'missing token') event.locals.session!.access_token = '';
		if (kind === 'missing email') event.locals.user = { ...event.locals.user!, email: undefined };
		expect(await POST(event)).toMatchObject({ status: 401 });
		h.denied();
		expect(provider.signIn).not.toHaveBeenCalled();
		expect(provider.limit).not.toHaveBeenCalled();
	}
);
it('redirects anonymous requests without provider effects', async () => {
	const h = fixture();
	const event = h.event();
	event.locals.user = null;
	await expect(POST(event)).rejects.toMatchObject({ status: 303, location: '/auth/login' });
	h.denied();
	expect(provider.signIn).not.toHaveBeenCalled();
});
it.each(['duplicate email', 'duplicate password', 'file password', 'oversized email', 'same email', 'malformed body'])(
	'rejects %s without password proof',
	async (kind) => {
		const h = fixture();
		const event = h.event();
		const body = new FormData();
		body.set(
			'email',
			kind === 'oversized email'
				? 'a'.repeat(250) + '@example.test'
				: kind === 'same email'
					? user.email
					: 'new@example.test'
		);
		body.set('currentPassword', ' OldPassword12 ');
		if (kind === 'duplicate email') body.append('email', 'other@example.test');
		if (kind === 'duplicate password') body.append('currentPassword', 'other');
		if (kind === 'file password') body.set('currentPassword', new Blob(['secret']), 'password.txt');
		event.request = new Request('https://app.invalid/account/security?/updateEmail', {
			method: 'POST',
			body: kind === 'malformed body' ? '{' : body
		});
		expect(await POST(event)).toMatchObject({ status: 400 });
		h.denied();
		expect(provider.signIn).not.toHaveBeenCalled();
		expect(provider.limit).not.toHaveBeenCalled();
	}
);

it('enforces the fifth-attempt boundary and permits a new window without sharing password-update buckets', async () => {
	const buckets = new Map<string, { count: number; expires: number }>();
	provider.limit.mockImplementation(async (_name, input) => {
		const nowMs = Date.parse(input.p_checked_at);
		let bucket = buckets.get(input.p_bucket_key);
		if (!bucket || bucket.expires <= nowMs) {
			bucket = { count: 0, expires: nowMs + input.p_window_seconds * 1000 };
			buckets.set(input.p_bucket_key, bucket);
		}
		bucket.count++;
		return {
			data: {
				limited: bucket.count > input.p_max_requests,
				retry_after_ms: bucket.count > input.p_max_requests ? bucket.expires - nowMs : 0
			},
			error: null
		};
	});
	provider.signIn.mockResolvedValue({ data: null, error: { status: 400 } });
	const h = fixture();
	for (let attempt = 0; attempt < 5; attempt++) expect(await POST(h.event())).toMatchObject({ status: 401 });
	expect(await POST(h.event())).toMatchObject({ status: 429, data: { retryAfterSeconds: 900 } });
	expect(provider.signIn).toHaveBeenCalledTimes(5);
	h.denied();
	vi.setSystemTime(new Date(now.getTime() + 900000));
	h.session.expires_at = now.getTime() / 1000 + 1800;
	expect(await POST(h.event())).toMatchObject({ status: 401 });
	expect(provider.signIn).toHaveBeenCalledTimes(6);
	expect([...buckets.keys()].every((key) => key.startsWith('email-change:'))).toBe(true);
});

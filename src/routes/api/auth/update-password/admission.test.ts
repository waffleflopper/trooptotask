import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { limit } = vi.hoisted(() => ({ limit: vi.fn() }));
vi.mock('$lib/server/passwordUpdateRateLimit', () => ({
	checkPasswordUpdateRateLimit: limit,
	PASSWORD_UPDATE_RATE_LIMIT_MESSAGE: 'Too many password update attempts.',
	passwordUpdateRateLimitAuditDetails: () => ({})
}));
vi.mock('$lib/server/auditLog', () => ({ auditLog: vi.fn() }));

import { POST } from './+server';

const NOW = new Date('2026-09-17T12:00:00Z');
const flows = [null, 'recovery', 'invite'] as const;
const validBody = {
	currentPassword: ' OldSecurePass12 ',
	password: ' NewSecurePass12 ',
	confirmPassword: ' NewSecurePass12 '
};

function fixture(flow: (typeof flows)[number] = null) {
	const user = { id: 'actor-1', email: 'actor@example.test' };
	const auth = {
		signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
		updateUser: vi.fn().mockResolvedValue({ error: null }),
		signOut: vi.fn().mockResolvedValue({ error: null })
	};
	const cookies = { delete: vi.fn(), set: vi.fn() };
	const locals = {
		user,
		session: { user, access_token: 'synthetic-token', expires_at: NOW.getTime() / 1000 + 60 },
		authFlow: flow,
		supabase: { auth }
	};
	function event(body: unknown = validBody) {
		return {
			request: new Request('http://localhost/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			}),
			locals,
			cookies,
			getClientAddress: () => '192.0.2.1'
		} as unknown as Parameters<typeof POST>[0];
	}
	function expectNoEffects() {
		expect(auth.signInWithPassword).not.toHaveBeenCalled();
		expect(auth.updateUser).not.toHaveBeenCalled();
		expect(auth.signOut).not.toHaveBeenCalled();
		expect(cookies.set).not.toHaveBeenCalled();
		expect(cookies.delete).not.toHaveBeenCalled();
	}
	return { locals, auth, cookies, event, expectNoEffects };
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
	limit.mockReset().mockResolvedValue({ limited: false });
});
afterEach(() => vi.useRealTimers());

describe.each(flows)('password update request admission: %s', (flow) => {
	it.each([
		['missing verified user', { user: null }],
		['missing verified user ID', { user: { email: 'actor@example.test' } }],
		['empty verified user ID', { user: { id: '', email: 'actor@example.test' } }],
		['non-string verified user ID', { user: { id: 123, email: 'actor@example.test' } }],
		[
			'different session actor',
			{ session: { user: { id: 'other-actor' }, access_token: 'token', expires_at: NOW.getTime() / 1000 + 60 } }
		],
		['missing session', { session: null }],
		['missing session user', { session: { access_token: 'token', expires_at: NOW.getTime() / 1000 + 60 } }]
	])('denies %s without consuming limits or changing pending state', async (_name, patch) => {
		const h = fixture(flow);
		Object.assign(h.locals, patch);
		const response = await POST(h.event());
		expect(response.status).toBe(401);
		expect((await response.json()).error).toEqual(expect.any(String));
		expect(limit).not.toHaveBeenCalled();
		h.expectNoEffects();
	});

	it.each([
		['missing token', { access_token: undefined }],
		['empty token', { access_token: '' }],
		['whitespace token', { access_token: ' token ' }],
		['non-string token', { access_token: 123 }],
		['missing expiry', { expires_at: undefined }],
		['text expiry', { expires_at: '9999999999' }],
		['non-finite expiry', { expires_at: Infinity }],
		['NaN expiry', { expires_at: NaN }],
		['expired session', { expires_at: NOW.getTime() / 1000 - 1 }],
		['exact expiry', { expires_at: NOW.getTime() / 1000 }]
	])('denies %s before any effect', async (_name, patch) => {
		const h = fixture(flow);
		Object.assign(h.locals.session, patch);
		expect((await POST(h.event())).status).toBe(401);
		expect(limit).not.toHaveBeenCalled();
		h.expectNoEffects();
	});

	it.each([null, [], 'password', 12, true])('rejects non-object input %j', async (body) => {
		const h = fixture(flow);
		expect((await POST(h.event(body))).status).toBe(400);
		expect(limit).not.toHaveBeenCalled();
		h.expectNoEffects();
	});

	it.each([null, {}, ['SecurePass12'], 123, true])('rejects a non-string new password %j', async (password) => {
		const h = fixture(flow);
		expect((await POST(h.event({ ...validBody, password }))).status).toBe(400);
		expect(limit).not.toHaveBeenCalled();
		h.expectNoEffects();
	});

	it('rejects malformed JSON without throwing or altering the session', async () => {
		const h = fixture(flow);
		const event = h.event();
		event.request = new Request(event.request.url, { method: 'POST', body: '{' });
		expect((await POST(event)).status).toBe(400);
		expect(limit).not.toHaveBeenCalled();
		h.expectNoEffects();
	});

	it('denies expiry while reading input before consuming limits', async () => {
		const h = fixture(flow);
		const event = h.event();
		vi.spyOn(event.request, 'json').mockImplementation(async () => {
			vi.setSystemTime(new Date('2026-09-17T12:01:00Z'));
			return validBody;
		});
		expect((await POST(event)).status).toBe(401);
		expect(limit).not.toHaveBeenCalled();
		h.expectNoEffects();
	});

	it('denies expiry during durable limit lookup, then accepts a newly verified session', async () => {
		const h = fixture(flow);
		limit.mockImplementationOnce(async () => {
			vi.setSystemTime(new Date('2026-09-17T12:01:00Z'));
			return { limited: false };
		});
		expect((await POST(h.event())).status).toBe(401);
		h.expectNoEffects();
		h.locals.session.expires_at = NOW.getTime() / 1000 + 120;
		expect((await POST(h.event())).status).toBe(200);
		expect(h.auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: validBody.password });
	});

	it('preserves password bytes and binds limit/proof to the verified actor', async () => {
		const h = fixture(flow);
		const body = flow ? { password: validBody.password } : validBody;
		const response = await POST(
			h.event({ ...body, userId: 'other-actor', email: 'other@example.test', authFlow: 'invite' })
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(limit).toHaveBeenCalledWith({ userId: 'actor-1', ip: '192.0.2.1' });
		if (flow) expect(h.auth.signInWithPassword).not.toHaveBeenCalled();
		else
			expect(h.auth.signInWithPassword).toHaveBeenCalledWith({
				email: 'actor@example.test',
				password: validBody.currentPassword
			});
		expect(h.auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: validBody.password });
		if (flow === 'recovery') expect(h.cookies.delete).toHaveBeenCalledWith('ttt_pending_auth_flow', { path: '/' });
		else expect(h.cookies.delete).not.toHaveBeenCalled();
	});
});

it.each([null, {}, ['OldSecurePass12'], 123, true, ''])(
	'requires scalar current-password proof: %j',
	async (currentPassword) => {
		const h = fixture();
		expect((await POST(h.event({ ...validBody, currentPassword }))).status).toBe(400);
		expect(limit).not.toHaveBeenCalled();
		h.expectNoEffects();
	}
);

it.each([null, {}, [' NewSecurePass12 '], 123, true, '', 'DifferentPass12'])(
	'requires matching scalar confirmation: %j',
	async (confirmPassword) => {
		const h = fixture();
		expect((await POST(h.event({ ...validBody, confirmPassword }))).status).toBe(400);
		expect(limit).not.toHaveBeenCalled();
		h.expectNoEffects();
	}
);

it.each([undefined, '', 123])('requires a usable verified email for password proof: %s', async (email) => {
	const h = fixture();
	Object.assign(h.locals.user, { email });
	expect((await POST(h.event())).status).toBe(401);
	expect(limit).not.toHaveBeenCalled();
	h.expectNoEffects();
});

it.each(['recovery', 'invite'])('does not take %s authorization from request input', async (authFlow) => {
	const h = fixture();
	const response = await POST(h.event({ password: validBody.password, authFlow }));
	expect(response.status).toBe(400);
	expect(limit).not.toHaveBeenCalled();
	h.expectNoEffects();
});

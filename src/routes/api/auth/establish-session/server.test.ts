import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CookieOptions } from '@supabase/ssr';
import { POST } from './+server';

type CookieWrite = { name: string; value: string; options: CookieOptions };
const provider = vi.hoisted(() => ({
	setSession: vi.fn(),
	stage: (_values: CookieWrite[]) => {}
}));
vi.mock('@supabase/ssr', () => ({
	createServerClient: (
		_url: string,
		_key: string,
		options: { cookies: { setAll: (values: CookieWrite[]) => void } }
	) => {
		provider.stage = options.cookies.setAll;
		return { auth: { setSession: provider.setSession } };
	}
}));
vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://session.invalid',
	PUBLIC_SUPABASE_ANON_KEY: 'synthetic-key'
}));
const validResult = () => ({
	data: {
		user: { id: 'new-user' },
		session: { user: { id: 'new-user' }, access_token: 'new-access', refresh_token: 'new-refresh' }
	},
	error: null
});
const tokens = { accessToken: 'access-token', refreshToken: 'refresh-token' };
function event(body: unknown = tokens, raw?: string) {
	const jar = new Map([
		['sb-session-auth-token', 'existing-session'],
		['ttt_pending_auth_flow', 'invite'],
		['theme', 'dark']
	]);
	const cookies = {
		getAll: () => [...jar].map(([name, value]) => ({ name, value })),
		set: vi.fn((name: string, value: string) => {
			jar.set(name, value);
		})
	};
	return {
		jar,
		cookies,
		request: new Request('https://app.invalid/api/auth/establish-session', {
			method: 'POST',
			body: raw ?? JSON.stringify(body)
		})
	};
}
async function run(input: ReturnType<typeof event>) {
	return POST(input as unknown as Parameters<typeof POST>[0]);
}
beforeEach(() => {
	provider.setSession.mockReset().mockImplementation(async () => {
		provider.stage([
			{ name: 'sb-session-auth-token', value: 'new-session', options: { path: '/', sameSite: 'lax', secure: true } }
		]);
		return validResult();
	});
});

describe('POST /api/auth/establish-session', () => {
	it('establishes a server-side session from access and refresh tokens without clearing an existing pending flow', async () => {
		const input = event();
		const response = await run(input);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(provider.setSession).toHaveBeenCalledWith({ access_token: 'access-token', refresh_token: 'refresh-token' });
		expect(input.jar.get('sb-session-auth-token')).toBe('new-session');
		expect(input.jar.get('ttt_pending_auth_flow')).toBe('invite');
		expect(input.jar.get('theme')).toBe('dark');
		expect(input.cookies.set).toHaveBeenCalledWith(
			'sb-session-auth-token',
			'new-session',
			expect.objectContaining({ path: '/', httpOnly: true, secure: true, sameSite: 'lax' })
		);
	});

	it.each(['recovery', 'invite'])('stores the pending %s marker only after a usable session result', async (flow) => {
		const input = event({ ...tokens, flow });
		expect((await run(input)).status).toBe(200);
		expect(input.cookies.set).toHaveBeenCalledWith(
			'ttt_pending_auth_flow',
			flow,
			expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax', maxAge: 3600 })
		);
	});

	it.each([{ accessToken: 'access-token' }, { refreshToken: 'refresh-token' }])(
		'rejects requests when either token is missing: %j',
		async (body) => {
			const input = event(body);
			expect((await run(input)).status).toBe(400);
			expect(provider.setSession).not.toHaveBeenCalled();
			expect(input.cookies.set).not.toHaveBeenCalled();
		}
	);

	it('fails closed when the session exchange is rejected, retaining prior cookies for retry', async () => {
		provider.setSession.mockImplementationOnce(async () => {
			provider.stage([{ name: 'sb-session-auth-token', value: '', options: { maxAge: 0 } }]);
			return { error: { message: 'private invalid refresh token', status: 400 } };
		});
		const input = event({ ...tokens, flow: 'recovery' });
		const before = new Map(input.jar);
		const response = await run(input);
		expect(response.status).toBe(401);
		expect(await response.text()).not.toContain('private');
		expect(input.jar).toEqual(before);
		expect(input.cookies.set).not.toHaveBeenCalled();
		expect((await run(event({ ...tokens, flow: 'recovery' }))).status).toBe(200);
	});

	it.each([
		null,
		[],
		1,
		{},
		{ ...tokens, accessToken: 7 },
		{ ...tokens, accessToken: ' ' },
		{ ...tokens, refreshToken: ['refresh'] },
		{ ...tokens, refreshToken: 'a b' },
		{ ...tokens, flow: 'unknown' },
		{ ...tokens, flow: {} }
	])('rejects malformed input %j before authentication', async (body) => {
		const input = event(body);
		expect((await run(input)).status).toBe(400);
		expect(provider.setSession).not.toHaveBeenCalled();
		expect(input.cookies.set).not.toHaveBeenCalled();
	});

	it('contains malformed JSON before provider access', async () => {
		expect((await run(event(null, '{'))).status).toBe(400);
		expect(provider.setSession).not.toHaveBeenCalled();
	});

	it.each([
		null,
		{},
		{ error: null },
		{ data: { user: null, session: null }, error: null },
		{ ...validResult(), error: { status: 500, message: 'private provider detail' } },
		{ data: { ...validResult().data, user: { id: 'different-user' } }, error: null },
		{ data: { ...validResult().data, session: { ...validResult().data.session, access_token: '' } }, error: null },
		{ data: { ...validResult().data, session: { ...validResult().data.session, refresh_token: null } }, error: null }
	])('does not accept unusable provider result %j', async (result) => {
		provider.setSession.mockImplementationOnce(async () => {
			provider.stage([{ name: 'sb-session-auth-token', value: 'untrusted-session', options: {} }]);
			return result;
		});
		const input = event({ ...tokens, flow: 'recovery' });
		const before = new Map(input.jar);
		const response = await run(input);
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('private');
		expect(input.jar).toEqual(before);
	});

	it('contains exceptions and permits an unchanged request to retry', async () => {
		provider.setSession.mockRejectedValueOnce(new Error('private provider detail'));
		const input = event(tokens);
		const response = await run(input);
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('private');
		expect(input.cookies.set).not.toHaveBeenCalled();
		expect((await run(event(tokens))).status).toBe(200);
	});
});

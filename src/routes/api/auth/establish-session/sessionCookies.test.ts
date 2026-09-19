import { createServerClient } from '@supabase/ssr';
import { afterEach, expect, it, vi } from 'vitest';
import { POST } from './+server';

vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://session.invalid',
	PUBLIC_SUPABASE_ANON_KEY: 'synthetic-key'
}));
afterEach(() => vi.unstubAllGlobals());

it('keeps an existing session on rejected refresh replay and publishes only verified token cookies on retry', async () => {
	const jar = new Map<string, string>([
		['theme', 'dark'],
		['ttt_pending_auth_flow', 'invite']
	]);
	const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated' };
	const token = (exp: number) =>
		`${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp, aud: 'authenticated' })}.${encode('synthetic-signature')}`;
	let refreshAllowed = false;
	const accessToken = token(4102444800);
	const transport = vi.fn(async (input: RequestInfo | URL) => {
		const url = new URL(String(input));
		if (url.pathname === '/auth/v1/user') return Response.json(user);
		if (url.pathname === '/auth/v1/token')
			return refreshAllowed
				? Response.json({
						access_token: accessToken,
						refresh_token: 'rotated-refresh',
						expires_in: 3600,
						token_type: 'bearer',
						user
					})
				: Response.json({ code: 'refresh_token_not_found', message: 'Synthetic replay rejection' }, { status: 400 });
		throw new Error(`Unexpected provider request ${url.pathname}`);
	});
	vi.stubGlobal('fetch', transport);
	const cookies = {
		getAll: () => [...jar].map(([name, value]) => ({ name, value })),
		set: vi.fn((name: string, value: string, options: { maxAge?: number }) => {
			if (options.maxAge === 0) jar.delete(name);
			else jar.set(name, value);
		})
	};
	const existing = createServerClient('https://session.invalid', 'synthetic-key', {
		cookies: {
			encode: 'tokens-only',
			getAll: cookies.getAll,
			setAll: (values) => {
				for (const { name, value, options } of values) cookies.set(name, value, options);
			}
		}
	});
	expect(
		(await existing.auth.setSession({ access_token: accessToken, refresh_token: 'existing-refresh' })).error
	).toBeNull();
	cookies.set.mockClear();
	const before = new Map(jar);
	const request = () =>
		({
			cookies,
			request: new Request('https://app.invalid/api/auth/establish-session', {
				method: 'POST',
				body: JSON.stringify({ accessToken: token(1), refreshToken: 'replayed-refresh', flow: 'recovery' })
			})
		}) as unknown as Parameters<typeof POST>[0];
	expect((await POST(request())).status).toBe(401);
	expect(jar).toEqual(before);
	expect(cookies.set).not.toHaveBeenCalled();
	refreshAllowed = true;
	expect((await POST(request())).status).toBe(200);
	expect(jar.get('ttt_pending_auth_flow')).toBe('recovery');
	expect(jar.get('theme')).toBe('dark');
	const authCookie = jar.get('sb-session-auth-token')!;
	const stored = JSON.parse(Buffer.from(authCookie.replace(/^base64-/, ''), 'base64url').toString());
	expect(stored).toMatchObject({ access_token: accessToken, refresh_token: 'rotated-refresh' });
	expect(stored.user).toBeUndefined();
	for (const [, , options] of cookies.set.mock.calls)
		expect(options).toMatchObject({ path: '/', httpOnly: true, sameSite: 'lax' });

	const repeat = {
		cookies,
		request: new Request('https://app.invalid/api/auth/establish-session', {
			method: 'POST',
			body: JSON.stringify({ accessToken, refreshToken: 'rotated-refresh', flow: 'recovery' })
		})
	} as unknown as Parameters<typeof POST>[0];
	expect((await POST(repeat)).status).toBe(200);
	expect(jar.get('ttt_pending_auth_flow')).toBe('recovery');
});

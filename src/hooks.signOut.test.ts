import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';
import { afterEach, expect, it, vi } from 'vitest';
import { handle } from './hooks.server';
import { actions } from './routes/auth/logout/+page.server';

vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://signout.invalid',
	PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon'
}));
vi.mock('$lib/server/env', () => ({}));
afterEach(() => vi.unstubAllGlobals());

it.each([
	{ path: '/dashboard', flow: 'recovery', status: 401 },
	{ path: '/dashboard', flow: 'invite', status: 403 },
	{ path: '/dashboard', flow: 'invite', status: 404 },
	{ path: '/auth/logout', flow: 'recovery', status: 401 },
	{ path: '/auth/logout', flow: 'invite', status: 403 },
	{ path: '/auth/logout', flow: 'invite', status: 404 }
])(
	'keeps real SSR cookies and denies dispatch on $status at $path, then permits retry',
	async ({ path, flow, status }) => {
		const jar = new Map([
			['ttt_pending_auth_flow', flow],
			['sb-another-auth-token', 'unrelated-session'],
			['theme', 'dark']
		]);
		const user = {
			id: '00000000-0000-4000-8000-000000000001',
			aud: 'authenticated',
			email: 'synthetic@example.test',
			app_metadata: {},
			user_metadata: {}
		};
		const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
		const now = Math.floor(Date.now() / 1000);
		const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', exp: now + 3600, iat: now, aal: 'aal1' })}.${encode('synthetic-signature')}`;
		let denied = true;
		const revoked: string[] = [];
		vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = new Request(input, init);
			const url = new URL(request.url);
			if (url.pathname === '/auth/v1/user') return Response.json(user);
			if (url.pathname === '/rest/v1/rpc/get_current_session_started_at')
				return Response.json(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString());
			if (url.pathname === '/auth/v1/logout') {
				expect(url.searchParams.get('scope')).toBe('global');
				expect(request.headers.get('authorization')).toBe(`Bearer ${token}`);
				if (denied) return Response.json({ message: 'Synthetic denial' }, { status });
				revoked.push(user.id);
				return new Response(null, { status: 204 });
			}
			throw new Error(`Unexpected provider request: ${url.pathname}`);
		});
		const getAll = () => [...jar].map(([name, value]) => ({ name, value }));
		const setup = createServerClient('https://signout.invalid', 'synthetic-anon', {
			cookies: {
				encode: 'tokens-only',
				getAll,
				setAll: (values) => values.forEach(({ name, value }) => jar.set(name, value))
			}
		});
		expect((await setup.auth.setSession({ access_token: token, refresh_token: 'synthetic-refresh' })).error).toBeNull();
		const before = new Map(jar);
		const request = () =>
			({
				url: new URL(`https://app.invalid${path}`),
				request: new Request(`https://app.invalid${path}`, { method: 'POST' }),
				locals: {},
				getClientAddress: () => `synthetic-${path}-${status}`,
				cookies: {
					getAll,
					get: (name: string) => jar.get(name),
					set: (name: string, value: string, options: { maxAge?: number }) =>
						options.maxAge === 0 ? jar.delete(name) : jar.set(name, value),
					delete: (name: string) => jar.delete(name)
				}
			}) as unknown as Parameters<Handle>[0]['event'];
		const protectedMutation = vi.fn();
		const resolve = vi.fn(async (event: Parameters<Handle>[0]['event']) => {
			if (path === '/auth/logout')
				return Response.json(await actions.default(event as Parameters<typeof actions.default>[0]));
			protectedMutation();
			return new Response('protected write');
		});
		const first = request();
		if (path === '/auth/logout')
			expect(await (await handle({ event: first, resolve })).json()).toMatchObject({ status: 503 });
		else {
			await expect(handle({ event: first, resolve })).rejects.toMatchObject({ status: 503 });
			expect(first.locals.session).toBeNull();
			expect(first.locals.user).toBeNull();
			expect(resolve).not.toHaveBeenCalled();
		}
		expect(jar).toEqual(before);
		expect(revoked).toEqual([]);
		denied = false;
		await expect(handle({ event: request(), resolve })).rejects.toMatchObject({
			status: 303,
			location: path === '/auth/logout' ? '/' : '/auth/login'
		});
		expect(protectedMutation).not.toHaveBeenCalled();
		expect(revoked).toEqual([user.id]);
		expect(jar).toEqual(
			new Map([
				['sb-another-auth-token', 'unrelated-session'],
				['theme', 'dark']
			])
		);
	}
);

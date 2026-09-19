import { createServerClient } from '@supabase/ssr';
import { expect, it, vi } from 'vitest';
import { actions } from './+page.server';

vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'https://logout.invalid' }));

type LogoutEvent = Parameters<(typeof actions)['default']>[0];

it.each([
	['recovery', 401],
	['invite', 403],
	['recovery', 404],
	['invite', 500]
] as const)(
	'preserves the %s session on HTTP %s, then revokes globally and clears only auth cookies on retry',
	async (flow, status) => {
		const jar = new Map<string, string>([
			['ttt_pending_auth_flow', flow],
			['theme', 'dark'],
			['sb-unrelated-auth-token', 'other-session']
		]);
		const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', email: 'synthetic@example.test' };
		const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
		const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', exp: 4102444800, aal: 'aal1' })}.${encode('synthetic-signature')}`;
		let unavailable = true;
		const revocations: { scope: string | null; authorization: string | null }[] = [];
		const createClient = () =>
			createServerClient('https://logout.invalid', 'synthetic-key', {
				cookies: {
					getAll: () => [...jar].map(([name, value]) => ({ name, value })),
					setAll: (cookies) => {
						for (const { name, value, options } of cookies) {
							if (options.maxAge === 0) jar.delete(name);
							else jar.set(name, value);
						}
					}
				},
				global: {
					fetch: async (input, init) => {
						const url = new URL(String(input));
						if (url.pathname === '/auth/v1/user') return Response.json(user);
						if (url.pathname === '/auth/v1/logout') {
							revocations.push({
								scope: url.searchParams.get('scope'),
								authorization: new Headers(init?.headers).get('authorization')
							});
							return unavailable
								? Response.json({ message: 'Synthetic revocation failure' }, { status })
								: new Response(null, { status: 204 });
						}
						throw new Error(`Unexpected provider request: ${url.pathname}`);
					}
				}
			});
		const supabase = createClient();
		const session = await supabase.auth.setSession({
			access_token: accessToken,
			refresh_token: 'synthetic-refresh-token'
		});
		expect(session.error).toBeNull();
		const before = new Map(jar);
		const event = {
			locals: { supabase },
			cookies: {
				delete: (name: string) => jar.delete(name),
				getAll: () => [...jar].map(([name, value]) => ({ name, value }))
			}
		} as unknown as LogoutEvent;

		expect(await actions.default(event)).toMatchObject({ status: 503 });
		expect(jar).toEqual(before);
		expect((await supabase.auth.getSession()).data.session?.user.id).toBe(user.id);

		unavailable = false;
		await expect(actions.default(event)).rejects.toMatchObject({ status: 303, location: '/' });
		expect(revocations).toEqual([
			{ scope: 'global', authorization: `Bearer ${accessToken}` },
			{ scope: 'global', authorization: `Bearer ${accessToken}` }
		]);
		expect(jar).toEqual(
			new Map([
				['theme', 'dark'],
				['sb-unrelated-auth-token', 'other-session']
			])
		);
		// Each HTTP request constructs a new SSR client from the surviving cookies.
		event.locals.supabase = createClient();
		expect((await event.locals.supabase.auth.getSession()).data.session).toBeNull();

		expect(await actions.default(event)).toEqual({ localOnly: true });
		expect(revocations).toHaveLength(2);
		expect(jar).toEqual(
			new Map([
				['theme', 'dark'],
				['sb-unrelated-auth-token', 'other-session']
			])
		);
	}
);

it('refreshes an expired access token before global revocation and keeps the refreshed session on denial', async () => {
	const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated' };
	const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const token = (exp: number) =>
		`${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', exp })}.${encode('synthetic')}`;
	const now = Math.floor(Date.now() / 1000);
	const expired = token(now - 3600);
	const current = token(now + 3600);
	const jar = new Map([
		['ttt_pending_auth_flow', 'recovery'],
		[
			'sb-logout-auth-token',
			`base64-${encode({ access_token: expired, refresh_token: 'old-refresh', expires_at: now - 3600, user })}`
		]
	]);
	let denied = true;
	const revoked: string[] = [];
	const makeClient = () =>
		createServerClient('https://logout.invalid', 'synthetic-key', {
			cookies: {
				getAll: () => [...jar].map(([name, value]) => ({ name, value })),
				setAll: (values) =>
					values.forEach(({ name, value, options }) => (options.maxAge === 0 ? jar.delete(name) : jar.set(name, value)))
			},
			global: {
				fetch: async (input, init) => {
					const request = new Request(input, init);
					const url = new URL(request.url);
					if (url.pathname === '/auth/v1/token')
						return Response.json({
							access_token: current,
							refresh_token: 'new-refresh',
							expires_in: 3600,
							token_type: 'bearer',
							user
						});
					if (url.pathname === '/auth/v1/logout') {
						expect(request.headers.get('authorization')).toBe(`Bearer ${current}`);
						if (denied) return Response.json({ message: 'Synthetic expired-session denial' }, { status: 401 });
						revoked.push(user.id);
						return new Response(null, { status: 204 });
					}
					throw new Error(`Unexpected request ${url.pathname}`);
				}
			}
		});
	const request = () =>
		({
			locals: { supabase: makeClient() },
			cookies: {
				getAll: () => [...jar].map(([name, value]) => ({ name, value })),
				delete: (name: string) => jar.delete(name)
			}
		}) as unknown as LogoutEvent;
	expect(await actions.default(request())).toMatchObject({ status: 503 });
	expect(jar.get('ttt_pending_auth_flow')).toBe('recovery');
	expect((await makeClient().auth.getSession()).data.session?.access_token).toBe(current);
	expect(revoked).toEqual([]);
	denied = false;
	await expect(actions.default(request())).rejects.toMatchObject({ status: 303, location: '/' });
	expect(revoked).toEqual([user.id]);
	expect(jar.size).toBe(0);
});

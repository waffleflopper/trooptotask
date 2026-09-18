import { createServerClient } from '@supabase/ssr';
import { expect, it } from 'vitest';
import { actions } from './+page.server';

type LogoutEvent = Parameters<(typeof actions)['default']>[0];

it.each(['recovery', 'invite'])(
	'preserves the %s session on provider failure, then revokes globally and clears only auth cookies on retry',
	async (flow) => {
		const jar = new Map<string, string>([
			['ttt_pending_auth_flow', flow],
			['theme', 'dark']
		]);
		const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', email: 'synthetic@example.test' };
		const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
		const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', exp: 4102444800, aal: 'aal1' })}.${encode('synthetic-signature')}`;
		let unavailable = true;
		const revocations: { scope: string | null; authorization: string | null }[] = [];
		const supabase = createServerClient('https://logout.invalid', 'synthetic-key', {
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
							? Response.json({ message: 'Synthetic revocation failure' }, { status: 500 })
							: new Response(null, { status: 204 });
					}
					throw new Error(`Unexpected provider request: ${url.pathname}`);
				}
			}
		});
		const session = await supabase.auth.setSession({
			access_token: accessToken,
			refresh_token: 'synthetic-refresh-token'
		});
		expect(session.error).toBeNull();
		const before = new Map(jar);
		const event = {
			locals: { supabase },
			cookies: { delete: (name: string) => jar.delete(name) }
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
		expect(jar).toEqual(new Map([['theme', 'dark']]));
		expect((await supabase.auth.getSession()).data.session).toBeNull();

		await expect(actions.default(event)).rejects.toMatchObject({ status: 303, location: '/' });
		expect(revocations).toHaveLength(2);
		expect(jar).toEqual(new Map([['theme', 'dark']]));
	}
);

vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({ rpc: attemptStore.rpc }) }));
import { attemptStore } from '../../../../tests/fixtures/passwordAttempt';
import { afterEach, expect, it, vi } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { POST } from './+server';

vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://proof.invalid',
	PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon'
}));
vi.mock('$features/identity/passwordUpdateRateLimit.server', () => ({
	checkPasswordUpdateRateLimit: async () => ({ limited: false })
}));
vi.mock('$lib/server/auditLog', () => ({ auditLog: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it('isolates real SDK proof, revokes only its temporary session, and changes the password through the retained AAL2 session', async () => {
	const user = {
		id: '00000000-0000-4000-8000-000000000001',
		email: 'actor@example.test',
		aud: 'authenticated',
		factors: [{ id: 'totp', factor_type: 'totp', status: 'verified' }]
	};
	const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const token = (aal: string) =>
		`${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, session_id: '00000000-0000-4000-8000-000000000001', exp: 4102444800, aud: 'authenticated', aal })}.${encode('synthetic-signature')}`;
	const admitted = token('aal2'),
		issued = token('aal1');
	const jar = new Map([
		[
			'sb-proof-auth-token',
			`base64-${encode({ access_token: admitted, refresh_token: 'admitted-refresh', expires_at: 4102444800, token_type: 'bearer' })}`
		],
		['theme', 'dark']
	]);
	const cookies = {
		get: (name: string) => jar.get(name),
		getAll: () => [...jar].map(([name, value]) => ({ name, value })),
		set: vi.fn((name: string, value: string) => {
			jar.set(name, value);
		}),
		delete: vi.fn()
	};
	let outcome:
		| 'wrong-password'
		| 'wrong-actor'
		| 'wrong-token-actor'
		| 'assurance-error'
		| 'revoke-error'
		| 'proof401'
		| 'proof403'
		| 'proof404'
		| 'completion-error'
		| 'accepted' = 'wrong-password';
	let identityReads = 0;
	const mutations: string[] = [],
		revocations: { scope: string | null; bearer: string | null }[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(String(input));
			const bearer = new Headers(init?.headers).get('Authorization');
			if (url.pathname === '/auth/v1/token') {
				expect(url.searchParams.get('grant_type')).toBe('password');
				expect(JSON.parse(String(init?.body))).toMatchObject({ email: user.email, password: ' OldPassword12 ' });
				if (outcome === 'wrong-password')
					return Response.json({ code: 'invalid_credentials', message: 'private' }, { status: 400 });
				return Response.json({
					access_token: issued,
					refresh_token: 'proof-refresh',
					expires_in: 3600,
					token_type: 'bearer',
					user: outcome === 'wrong-actor' ? { ...user, id: 'other' } : user
				});
			}
			if (url.pathname === '/auth/v1/user') {
				if (init?.method === 'PUT') {
					expect(bearer).toBe(`Bearer ${admitted}`);
					mutations.push(JSON.parse(String(init?.body)).password);
					return Response.json(user);
				}
				expect([`Bearer ${issued}`, `Bearer ${admitted}`]).toContain(bearer);
				if (bearer === `Bearer ${admitted}`) return Response.json(user);
				identityReads++;
				if (outcome === 'wrong-token-actor') return Response.json({ ...user, id: 'other' });
				if (outcome === 'assurance-error' && identityReads === 2)
					return Response.json({ message: 'private' }, { status: 503 });
				return Response.json(user);
			}
			if (url.pathname === '/auth/v1/logout') {
				const scope = url.searchParams.get('scope');
				revocations.push({ scope, bearer });
				if (outcome.startsWith('proof'))
					return Response.json({ message: 'private cleanup failure' }, { status: Number(outcome.slice(5)) });
				expect(bearer).toBe(`Bearer ${scope === 'local' ? issued : admitted}`);
				if (outcome === 'revoke-error' || (outcome === 'completion-error' && scope === 'others'))
					return Response.json({ message: 'private' }, { status: 500 });
				return new Response(null, { status: 204 });
			}
			throw new Error(`Unexpected provider request ${url.pathname}`);
		})
	);
	const event = () =>
		({
			request: new Request('https://app.invalid/api/auth/update-password', {
				method: 'POST',
				body: JSON.stringify({
					currentPassword: ' OldPassword12 ',
					password: ' NewPassword12 ',
					confirmPassword: ' NewPassword12 '
				})
			}),
			locals: {
				user,
				session: { user, access_token: admitted, expires_at: 4102444800 },
				mfaPending: false,
				supabase: createServerClient('https://proof.invalid', 'synthetic-anon', {
					cookies: {
						encode: 'tokens-only',
						getAll: cookies.getAll,
						setAll: (values) => {
							for (const { name, value } of values) cookies.set(name, value);
						}
					}
				})
			},
			cookies,
			getClientAddress: () => '192.0.2.1'
		}) as unknown as Parameters<typeof POST>[0];
	const before = new Map(jar);
	for (const [failure, status] of [
		['wrong-password', 401],
		['wrong-actor', 503],
		['wrong-token-actor', 503],
		['assurance-error', 503],
		['revoke-error', 503],
		['proof401', 503],
		['proof403', 503],
		['proof404', 503]
	] as const) {
		outcome = failure;
		identityReads = 0;
		const response = await POST(event());
		expect(response.status).toBe(status);
		expect(await response.text()).not.toContain('private');
		expect(mutations).toEqual([]);
		expect(jar).toEqual(before);
		expect(cookies.set).not.toHaveBeenCalled();
	}
	outcome = 'completion-error';
	identityReads = 0;
	revocations.length = 0;
	expect(await (await POST(event())).json()).toMatchObject({
		ok: false,
		passwordUpdated: true,
		code: 'session_revocation_pending'
	});
	outcome = 'accepted';
	expect(await (await POST(event())).json()).toEqual({ ok: true });
	expect(mutations).toEqual([' NewPassword12 ']);
	expect(revocations).toEqual([
		{ scope: 'local', bearer: `Bearer ${issued}` },
		{ scope: 'others', bearer: `Bearer ${admitted}` },
		{ scope: 'others', bearer: `Bearer ${admitted}` }
	]);
	const stored = JSON.parse(
		Buffer.from(jar.get('sb-proof-auth-token')!.replace(/^base64-/, ''), 'base64url').toString()
	);
	expect(stored).toMatchObject({ access_token: admitted, refresh_token: 'admitted-refresh' });
	expect(stored.user).toBeUndefined();
	expect(jar.get('theme')).toBe('dark');
});

it.each(['missing actor', 'wrong actor', 'provider unavailable', 'accepted', 'revoke401', 'revoke403', 'revoke404'])(
	'validates the real SDK mutation result for %s before completion',
	async (outcome) => {
		attemptStore.committed = outcome === 'accepted' || outcome.startsWith('revoke');
		const user = { id: '00000000-0000-4000-8000-000000000001', email: 'actor@example.test', aud: 'authenticated' };
		const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
		const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, session_id: '00000000-0000-4000-8000-000000000001', exp: 4102444800, aud: 'authenticated', aal: 'aal1' })}.${encode('synthetic')}`;
		const revocations: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = new URL(String(input));
				if (url.pathname === '/auth/v1/user') {
					if (init?.method === 'PUT') {
						expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${token}`);
						if (outcome === 'provider unavailable') return Response.json({ message: 'private' }, { status: 503 });
						return Response.json(
							outcome === 'missing actor' ? {} : outcome === 'wrong actor' ? { ...user, id: 'other' } : user
						);
					}
					return Response.json(user);
				}
				if (url.pathname === '/auth/v1/logout') {
					revocations.push(url.searchParams.get('scope')!);
					expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${token}`);
					if (outcome.startsWith('revoke'))
						return Response.json({ message: 'private revocation failure' }, { status: Number(outcome.slice(6)) });
					return new Response(null, { status: 204 });
				}
				throw Error(`Unexpected ${url.pathname}`);
			})
		);
		const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
		const supabase = createServerClient('https://proof.invalid', 'synthetic-anon', {
			cookies: {
				getAll: () => [
					{
						name: 'sb-proof-auth-token',
						value: `base64-${encode({ access_token: token, refresh_token: 'synthetic-refresh', expires_at: 4102444800, token_type: 'bearer' })}`
					}
				],
				setAll: () => {}
			}
		});
		const response = await POST({
			request: new Request('https://app.invalid/api/auth/update-password', {
				method: 'POST',
				body: JSON.stringify({ password: 'NewPassword12' })
			}),
			locals: { user, session: { user, access_token: token, expires_at: 4102444800 }, authFlow: 'recovery', supabase },
			cookies,
			getClientAddress: () => '192.0.2.1'
		} as unknown as Parameters<typeof POST>[0]);
		expect(response.status).toBe(outcome === 'accepted' ? 200 : outcome.startsWith('revoke') ? 202 : 409);
		expect(await response.text()).not.toContain('private');
		expect(revocations).toEqual(outcome === 'accepted' || outcome.startsWith('revoke') ? ['others'] : []);
		expect(cookies.delete).toHaveBeenCalledTimes(outcome === 'accepted' ? 1 : 0);
	}
);

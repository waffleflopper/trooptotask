import { afterEach, expect, it, vi } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { actions } from './+page.server';
const POST = actions.updateEmail;

vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://proof.invalid',
	PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon'
}));
vi.mock('$lib/server/supabase', () => ({
	getAdminClient: () => ({ rpc: async () => ({ data: { limited: false, retry_after_ms: 0 }, error: null }) })
}));
afterEach(() => vi.unstubAllGlobals());

it('isolates real SDK proof, revokes only its temporary session, and requests the email change through the retained AAL2 session', async () => {
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
					mutations.push(JSON.parse(String(init?.body)).email);
					return Response.json({ ...user, new_email: 'new@example.test' });
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
			request: new Request('https://app.invalid/account/security?/updateEmail', {
				method: 'POST',
				body: new URLSearchParams({ currentPassword: ' OldPassword12 ', email: 'new@example.test' })
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
		expect(response).toMatchObject({ status });
		expect(JSON.stringify(response)).not.toContain('private');
		expect(mutations).toEqual([]);
		expect(jar).toEqual(before);
		expect(cookies.set).not.toHaveBeenCalled();
	}
	outcome = 'accepted';
	identityReads = 0;
	revocations.length = 0;
	expect(await POST(event())).toMatchObject({ pendingEmail: 'new@example.test' });
	expect(mutations).toEqual(['new@example.test']);
	expect(revocations).toEqual([{ scope: 'local', bearer: `Bearer ${issued}` }]);
	const stored = JSON.parse(
		Buffer.from(jar.get('sb-proof-auth-token')!.replace(/^base64-/, ''), 'base64url').toString()
	);
	expect(stored).toMatchObject({ access_token: admitted, refresh_token: 'admitted-refresh' });
	expect(stored.user).toBeUndefined();
	expect(jar.get('theme')).toBe('dark');
});

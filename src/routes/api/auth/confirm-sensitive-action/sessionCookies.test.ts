import { afterEach, expect, it, vi } from 'vitest';
import { POST } from './+server';

vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://confirmation.invalid',
	PUBLIC_SUPABASE_ANON_KEY: 'synthetic-key'
}));
afterEach(() => vi.unstubAllGlobals());

it('stages real SDK password cookies until bound proof and assurance pass, then publishes token-only MFA continuation', async () => {
	const jar = new Map([
		['sb-confirmation-auth-token', 'previous-session'],
		['theme', 'dark']
	]);
	const cookies = {
		getAll: () => [...jar].map(([name, value]) => ({ name, value })),
		set: vi.fn((name: string, value: string, _options: unknown) => {
			jar.set(name, value);
		})
	};
	const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', email: 'owner@example.test' };
	const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: 4102444800, aud: 'authenticated', aal: 'aal1' })}.${encode('synthetic-signature')}`;
	let outcome: 'wrong-password' | 'wrong-user' | 'assurance-error' | 'mfa' | 'success' = 'wrong-password';
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(String(input));
			if (url.pathname === '/auth/v1/token') {
				expect(url.searchParams.get('grant_type')).toBe('password');
				expect(JSON.parse(String(init?.body))).toMatchObject({ email: user.email, password: 'password-bytes' });
				if (outcome === 'wrong-password')
					return Response.json({ code: 'invalid_credentials', message: 'private rejection' }, { status: 400 });
				return Response.json({
					access_token: accessToken,
					refresh_token: 'confirmed-refresh',
					expires_in: 3600,
					token_type: 'bearer',
					user: outcome === 'wrong-user' ? { ...user, id: 'other-user' } : user
				});
			}
			if (url.pathname === '/auth/v1/user') {
				expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${accessToken}`);
				if (outcome === 'assurance-error')
					return Response.json({ message: 'private assurance failure' }, { status: 403 });
				return Response.json({
					...user,
					factors: outcome === 'mfa' ? [{ id: 'totp-factor', factor_type: 'totp', status: 'verified' }] : []
				});
			}
			throw new Error(`Unexpected provider request ${url.pathname}`);
		})
	);
	const request = () =>
		({
			cookies,
			locals: { user, session: { user, access_token: 'old-access', expires_at: 4102444800 } },
			request: new Request('https://app.invalid/api/auth/confirm-sensitive-action', {
				method: 'POST',
				body: JSON.stringify({ password: 'password-bytes' })
			})
		}) as unknown as Parameters<typeof POST>[0];
	const before = new Map(jar);
	for (const [failure, status] of [
		['wrong-password', 401],
		['wrong-user', 503],
		['assurance-error', 503]
	] as const) {
		outcome = failure;
		const response = await POST(request());
		expect(response.status).toBe(status);
		expect(await response.text()).not.toContain('private');
		expect(jar).toEqual(before);
		expect(cookies.set).not.toHaveBeenCalled();
	}
	outcome = 'mfa';
	expect(await (await POST(request())).json()).toEqual({ requiresStepUp: true, stepUpPath: '/auth/mfa-verify' });
	const stored = JSON.parse(
		Buffer.from(jar.get('sb-confirmation-auth-token')!.replace(/^base64-/, ''), 'base64url').toString()
	);
	expect(stored).toMatchObject({ access_token: accessToken, refresh_token: 'confirmed-refresh' });
	expect(stored.user).toBeUndefined();
	expect(jar.get('theme')).toBe('dark');
	for (const [, , options] of cookies.set.mock.calls)
		expect(options).toMatchObject({ path: '/', httpOnly: true, sameSite: 'lax' });
	outcome = 'success';
	expect(await (await POST(request())).json()).toEqual({ success: true });
});

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { CookieOptions } from '@supabase/ssr';
import { POST } from './+server';

const provider = vi.hoisted(() => ({
	signInWithPassword: vi.fn(),
	assurance: vi.fn(),
	stage: (_values: { name: string; value: string; options: CookieOptions }[]) => {}
}));
vi.mock('@supabase/ssr', () => ({
	createServerClient: (_url: string, _key: string, options: { cookies: { setAll: typeof provider.stage } }) => {
		provider.stage = options.cookies.setAll;
		return {
			auth: {
				signInWithPassword: provider.signInWithPassword,
				mfa: { getAuthenticatorAssuranceLevel: provider.assurance }
			}
		};
	}
}));
vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://confirmation.invalid',
	PUBLIC_SUPABASE_ANON_KEY: 'synthetic-key'
}));
const validResult = () => ({
	data: {
		user: { id: 'owner' },
		session: {
			user: { id: 'owner' },
			access_token: 'new-access',
			refresh_token: 'new-refresh',
			expires_at: Date.now() / 1000 + 3600
		}
	},
	error: null
});
function event(body: unknown = { password: 'correct-password' }, raw?: string) {
	const jar = new Map([
		['sb-confirmation-auth-token', 'existing-session'],
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
		request: new Request('https://app.invalid/api/auth/confirm-sensitive-action', {
			method: 'POST',
			body: raw ?? JSON.stringify(body)
		}),
		locals: {
			user: { id: 'owner', email: 'owner@example.com' },
			session: { user: { id: 'owner' }, access_token: 'old-access', expires_at: Date.now() / 1000 + 3600 },
			supabase: {
				auth: {
					signInWithPassword: provider.signInWithPassword,
					mfa: { getAuthenticatorAssuranceLevel: provider.assurance }
				}
			}
		}
	};
}
const run = (input: ReturnType<typeof event>) => POST(input as unknown as Parameters<typeof POST>[0]);
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));
	provider.signInWithPassword.mockReset().mockImplementation(async () => {
		provider.stage([
			{ name: 'sb-confirmation-auth-token', value: 'confirmed-session', options: { path: '/', sameSite: 'lax' } }
		]);
		return validResult();
	});
	provider.assurance.mockReset().mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('password confirmation', () => {
	it.each([
		['aal1', 'aal1'],
		['aal2', 'aal2']
	])('confirms recognized %s/%s assurance without mutating Organization data', async (currentLevel, nextLevel) => {
		provider.assurance.mockResolvedValue({ data: { currentLevel, nextLevel }, error: null });
		const input = event({ password: '  password bytes  ', email: 'attacker@example.com', orgId: 'other-org' });
		const response = await run(input);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(provider.signInWithPassword).toHaveBeenCalledWith({
			email: 'owner@example.com',
			password: '  password bytes  '
		});
		expect(provider.assurance).toHaveBeenCalledWith('new-access');
		expect(input.jar.get('sb-confirmation-auth-token')).toBe('confirmed-session');
		expect(input.jar.get('theme')).toBe('dark');
		expect(input.cookies.set).toHaveBeenCalledWith(
			'sb-confirmation-auth-token',
			'confirmed-session',
			expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax' })
		);
	});
	it('publishes the bound session for MFA continuation without reporting success', async () => {
		provider.assurance.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
		const input = event();
		const response = await run(input);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ requiresStepUp: true, stepUpPath: '/auth/mfa-verify' });
		expect(input.jar.get('sb-confirmation-auth-token')).toBe('confirmed-session');
	});
	it.each([null, [], 2, {}, { password: '' }, { password: 1 }, { password: ['secret'] }])(
		'rejects malformed input %j before provider access',
		async (body) => {
			const input = event(body);
			expect((await run(input)).status).toBe(400);
			expect(provider.signInWithPassword).not.toHaveBeenCalled();
			expect(input.cookies.set).not.toHaveBeenCalled();
		}
	);
	it('rejects invalid JSON before provider access', async () => {
		expect((await run(event(null, '{'))).status).toBe(400);
		expect(provider.signInWithPassword).not.toHaveBeenCalled();
	});
	it.each(['no-user', 'no-email', 'no-session', 'mismatched-session', 'expired-session'])(
		'requires a bound current identity: %s',
		async (kind) => {
			const input = event();
			if (kind === 'no-user') input.locals.user = null as never;
			if (kind === 'no-email') input.locals.user.email = '';
			if (kind === 'no-session') input.locals.session = null as never;
			if (kind === 'mismatched-session') input.locals.session.user.id = 'other-user';
			if (kind === 'expired-session') input.locals.session.expires_at = Date.now() / 1000;
			const response = await run(input);
			expect(response.status).toBe(401);
			expect(await response.json()).toMatchObject({ requiresStepUp: true, stepUpPath: '/auth/login' });
			expect(provider.signInWithPassword).not.toHaveBeenCalled();
			expect(input.cookies.set).not.toHaveBeenCalled();
		}
	);
	it('rejects incorrect credentials generically and allows retry', async () => {
		provider.signInWithPassword.mockResolvedValueOnce({
			data: null,
			error: { status: 400, message: 'private provider details' }
		});
		const input = event();
		const before = new Map(input.jar);
		const response = await run(input);
		expect(response.status).toBe(401);
		expect(await response.text()).not.toContain('private');
		expect(input.jar).toEqual(before);
		expect(provider.assurance).not.toHaveBeenCalled();
		expect((await run(event())).status).toBe(200);
	});
	const badProofs = [
		undefined,
		null,
		{},
		{ error: null },
		{ data: null, error: null },
		{ data: validResult().data, error: { status: 500, message: 'private' } },
		{ ...validResult(), data: { ...validResult().data, user: { id: 'another-user' } } },
		{
			...validResult(),
			data: { ...validResult().data, session: { ...validResult().data.session, user: { id: 'another-user' } } }
		},
		...['access_token', 'refresh_token', 'expires_at'].map((key) => ({
			...validResult(),
			data: { ...validResult().data, session: { ...validResult().data.session, [key]: null } }
		}))
	];
	it.each(badProofs)('denies unusable password proof %# and preserves cookies', async (result) => {
		provider.signInWithPassword.mockImplementationOnce(async () => {
			provider.stage([{ name: 'sb-confirmation-auth-token', value: 'untrusted', options: {} }]);
			return result;
		});
		const input = event();
		const before = new Map(input.jar);
		const response = await run(input);
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('private');
		expect(input.jar).toEqual(before);
		expect(provider.assurance).not.toHaveBeenCalled();
	});
	it.each([
		undefined,
		null,
		{},
		{ error: null, data: null },
		{ error: null, data: { currentLevel: 'aal1' } },
		{ error: null, data: { currentLevel: 'unknown', nextLevel: 'aal1' } },
		{ error: null, data: { currentLevel: 'aal1', nextLevel: 'unknown' } },
		{ error: { message: 'private' }, data: { currentLevel: 'aal1', nextLevel: 'aal1' } }
	])('denies unavailable assurance %# without publishing password session', async (result) => {
		provider.assurance.mockResolvedValueOnce(result);
		const input = event();
		const before = new Map(input.jar);
		const response = await run(input);
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('private');
		expect(input.jar).toEqual(before);
		expect((await run(event())).status).toBe(200);
	});
	it.each(['password', 'assurance'])('handles thrown %s failures privately with retry', async (stage) => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		(stage === 'password' ? provider.signInWithPassword : provider.assurance).mockRejectedValueOnce(
			new Error('private password/token')
		);
		const input = event();
		const before = new Map(input.jar);
		const response = await run(input);
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('private');
		expect(input.jar).toEqual(before);
		expect(JSON.stringify(spy.mock.calls)).not.toContain('private');
		expect((await run(event())).status).toBe(200);
	});
	it.each(['expired', 'during-assurance'])(
		'rejects a session that expires %s before publishing cookies',
		async (stage) => {
			const result = validResult();
			if (stage === 'expired') result.data.session.expires_at = Date.now() / 1000;
			provider.signInWithPassword.mockResolvedValueOnce(result);
			if (stage === 'during-assurance')
				provider.assurance.mockImplementationOnce(async () => {
					vi.advanceTimersByTime(3600_000);
					return { error: null, data: { currentLevel: 'aal1', nextLevel: 'aal1' } };
				});
			const input = event();
			const before = new Map(input.jar);
			expect((await run(input)).status).toBe(503);
			expect(input.jar).toEqual(before);
		}
	);
	it('rechecks proof and assurance on repeated confirmation instead of caching permission', async () => {
		expect((await run(event())).status).toBe(200);
		provider.assurance.mockResolvedValueOnce({ error: null, data: { currentLevel: 'aal1', nextLevel: 'aal2' } });
		expect(await (await run(event())).json()).toEqual({ requiresStepUp: true, stepUpPath: '/auth/mfa-verify' });
		provider.signInWithPassword.mockResolvedValueOnce({ error: { status: 400 }, data: null });
		expect((await run(event())).status).toBe(401);
	});
});

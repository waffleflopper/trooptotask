import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies, Handle } from '@sveltejs/kit';

interface TestUserStorage {
	getItem(key: string): string | null;
}

const NOW = new Date('2026-09-16T12:00:00Z');

interface TestServerClientOptions {
	cookies: {
		setAll(cookies: { name: string; value: string; options: Parameters<Cookies['set']>[2] }[]): void;
	};
	auth?: {
		userStorage?: TestUserStorage;
	};
}

describe('server auth hook', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	async function createAuthenticatedHookHarness(
		rpcResult: {
			data: boolean | null;
			error: { message: string } | null;
		},
		options: { authenticatedUserId?: string; lastSignInAt?: string } = {}
	) {
		const now = new Date();
		const user = {
			id: 'user-1',
			aud: 'authenticated',
			email: 'user@example.com',
			app_metadata: {},
			user_metadata: {},
			created_at: now.toISOString(),
			last_sign_in_at: options.lastSignInAt ?? now.toISOString(),
			role: 'authenticated'
		};
		const authenticatedUser = { ...user, id: options.authenticatedUserId ?? user.id };
		const session = {
			access_token: 'token',
			refresh_token: 'refresh-token',
			expires_in: 3600,
			expires_at: Math.floor(now.getTime() / 1000) + 3600,
			provider_token: 'provider-token-should-not-serialize',
			provider_refresh_token: 'provider-refresh-token-should-not-serialize',
			token_type: 'bearer' as const
		};
		Object.defineProperty(session, 'user', {
			enumerable: true,
			get() {
				throw new Error('getSession user should not be trusted');
			}
		});
		const getSession = vi.fn().mockResolvedValue({
			data: {
				session
			},
			error: null
		});
		const getClaims = vi.fn().mockResolvedValue({
			data: {
				claims: {
					sub: user.id,
					aud: 'authenticated',
					email: user.email,
					role: 'authenticated',
					iat: Math.floor(now.getTime() / 1000),
					app_metadata: {},
					user_metadata: {}
				}
			},
			error: null
		});
		const getUser = vi.fn().mockResolvedValue({
			data: { user: authenticatedUser },
			error: null
		});
		const signOut = vi.fn().mockResolvedValue({ error: null });
		let serverClientOptions: TestServerClientOptions | null = null;
		const readStoredUserDuringMfa = vi.fn(() =>
			serverClientOptions?.auth?.userStorage?.getItem('sb-example-auth-token-user')
		);
		const getAuthenticatorAssuranceLevel = vi.fn(async () => {
			readStoredUserDuringMfa();
			return {
				data: { currentLevel: 'aal1', nextLevel: 'aal1' },
				error: null
			};
		});
		const rpc = vi.fn().mockResolvedValue(rpcResult);
		const createServerClient = vi.fn((_url: string, _key: string, options: TestServerClientOptions) => {
			serverClientOptions = options;
			return {
				auth: {
					signOut,
					getSession,
					getClaims,
					getUser,
					mfa: {
						getAuthenticatorAssuranceLevel
					}
				},
				rpc
			};
		});
		const resolve = vi.fn().mockResolvedValue(new Response('ok'));

		vi.doMock('@supabase/ssr', () => ({ createServerClient }));
		vi.doMock('$env/static/public', () => ({
			PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
			PUBLIC_SUPABASE_ANON_KEY: 'anon-key'
		}));
		vi.doMock('$lib/server/env', () => ({}));

		const { handle } = await import('./hooks.server');
		function createEvent(
			path = '/dashboard',
			cookieValues: Record<string, string> = { 'sb-example-auth-token': 'session' }
		) {
			const cookieJar = new Map(Object.entries(cookieValues));
			const event = {
				url: new URL(`http://localhost${path}`),
				request: new Request(`http://localhost${path}`, { method: 'POST' }),
				locals: {},
				getClientAddress: () => '127.0.0.1',
				cookies: {
					getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
					get: (name: string) => cookieJar.get(name),
					set: vi.fn((name: string, value: string, _options: Parameters<Cookies['set']>[2]) => {
						cookieJar.set(name, value);
					}),
					delete: vi.fn((name: string, _options: { path: string }) => {
						cookieJar.delete(name);
					})
				}
			} as unknown as Parameters<Handle>[0]['event'];
			return event;
		}
		const event = createEvent();

		return {
			handle,
			event,
			createEvent,
			resolve,
			rpc,
			getSession,
			getClaims,
			getUser,
			signOut,
			deleteCookie: event.cookies.delete,
			readStoredUserDuringMfa,
			getClientOptions: () => {
				if (!serverClientOptions) throw new Error('Hook has not initialized the provider');
				return serverClientOptions;
			}
		};
	}

	it('admits anonymous public requests without exposing a session', async () => {
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		const event = harness.createEvent('/about', {});

		expect((await harness.handle({ event, resolve: harness.resolve })).status).toBe(200);
		expect(event.locals.user).toBeNull();
		expect(event.locals.session).toBeNull();
		expect(harness.getSession).not.toHaveBeenCalled();
		expect(harness.resolve).toHaveBeenCalled();
	});

	it('rejects anonymous protected writes without accepting another project cookie', async () => {
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		const event = harness.createEvent('/org/organization-a/api/personnel', {
			'sb-other-auth-token': 'foreign-project-session'
		});

		await expect(harness.handle({ event, resolve: harness.resolve })).rejects.toMatchObject({
			status: 303,
			location: '/auth/login'
		});
		expect(harness.resolve).not.toHaveBeenCalled();
		expect(harness.getSession).not.toHaveBeenCalled();
		expect(event.locals.session).toBeNull();
	});

	it.each([
		{ stage: 'getSession', data: { session: null } },
		{ stage: 'getClaims', data: null },
		{ stage: 'getUser', data: { user: null } }
	] as const)('rejects a protected write when $stage returns no identity', async ({ stage, data }) => {
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		harness[stage].mockResolvedValue({ data, error: null });

		await expect(harness.handle(harness)).rejects.toMatchObject({ status: 303, location: '/auth/login' });
		expect(harness.resolve).not.toHaveBeenCalled();
		expect(harness.event.locals.user).toBeNull();
		expect(harness.event.locals.session).toBeNull();
	});

	it.each(['getSession', 'getClaims', 'getUser'] as const)(
		'rejects a protected write when %s reports a verification error',
		async (stage) => {
			const harness = await createAuthenticatedHookHarness({ data: false, error: null });
			const validResult = await harness[stage]();
			harness[stage].mockResolvedValue({ ...validResult, error: { message: 'Verification failed' } });

			await expect(harness.handle(harness)).rejects.toMatchObject({ status: 303, location: '/auth/login' });
			expect(harness.resolve).not.toHaveBeenCalled();
			expect(harness.event.locals.user).toBeNull();
			expect(harness.event.locals.session).toBeNull();
		}
	);

	it.each(['getSession', 'getClaims', 'getUser'] as const)(
		'does not invoke the protected handler when %s is unavailable',
		async (stage) => {
			const harness = await createAuthenticatedHookHarness({ data: false, error: null });
			const unavailable = new Error('Synthetic auth provider unavailable');
			harness[stage].mockRejectedValue(unavailable);

			await expect(harness.handle(harness)).rejects.toBe(unavailable);
			expect(harness.resolve).not.toHaveBeenCalled();
		}
	);

	it.each([
		{ stage: 'getSession', code: 'refresh_token_already_used', thrown: true },
		{ stage: 'getClaims', code: 'session_expired', thrown: false },
		{ stage: 'getUser', code: 'session_not_found', thrown: true },
		{ stage: 'getUser', code: 'refresh_token_not_found', thrown: false }
	] as const)(
		'clears stale credentials and denies replay after $stage reports $code',
		async ({ stage, code, thrown }) => {
			const harness = await createAuthenticatedHookHarness({ data: false, error: null });
			const event = harness.createEvent('/dashboard', {
				'sb-example-auth-token.0': 'stale-first-chunk',
				'sb-example-auth-token.1': 'stale-second-chunk',
				'sb-other-auth-token': 'other-project-cookie',
				theme: 'dark',
				ttt_pending_auth_flow: 'invite'
			});
			const stale = Object.assign(new Error('Synthetic stale credential'), { code });
			if (thrown) harness[stage].mockRejectedValue(stale);
			else harness[stage].mockResolvedValue({ data: null, error: stale });

			await expect(harness.handle({ event, resolve: harness.resolve })).rejects.toMatchObject({
				status: 303,
				location: '/auth/login'
			});
			expect(harness.resolve).not.toHaveBeenCalled();
			expect(event.locals.session).toBeNull();
			expect(event.locals.authFlow).toBeNull();
			expect(event.cookies.getAll()).toEqual([
				{ name: 'sb-other-auth-token', value: 'other-project-cookie' },
				{ name: 'theme', value: 'dark' }
			]);
		}
	);

	it('admits a verified session before its absolute lifetime expires', async () => {
		const harness = await createAuthenticatedHookHarness(
			{ data: false, error: null },
			{ lastSignInAt: '2026-09-15T12:00:01Z' }
		);

		expect((await harness.handle(harness)).status).toBe(200);
		expect(harness.event.locals.user?.id).toBe('user-1');
		expect(harness.signOut).not.toHaveBeenCalled();
		expect(harness.resolve).toHaveBeenCalled();
	});

	it('revokes a session past its absolute lifetime before a protected write', async () => {
		const harness = await createAuthenticatedHookHarness(
			{ data: false, error: null },
			{ lastSignInAt: '2026-09-15T11:59:59Z' }
		);
		const event = harness.createEvent('/dashboard', {
			'sb-example-auth-token': 'expired-session',
			ttt_pending_auth_flow: 'recovery'
		});

		await expect(harness.handle({ event, resolve: harness.resolve })).rejects.toMatchObject({
			status: 303,
			location: '/auth/login'
		});
		expect(harness.signOut).toHaveBeenCalledOnce();
		expect(event.locals.user).toBeNull();
		expect(event.locals.session).toBeNull();
		expect(event.locals.authFlow).toBeNull();
		expect(event.cookies.get('ttt_pending_auth_flow')).toBeUndefined();
		expect(harness.resolve).not.toHaveBeenCalled();
	});

	it('does not reuse a verified identity or provider user storage in a later anonymous request', async () => {
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		await harness.handle(harness);
		const authenticatedStorage = harness.getClientOptions().auth?.userStorage;
		const anonymous = harness.createEvent('/dashboard', {});
		harness.resolve.mockClear();

		await expect(harness.handle({ event: anonymous, resolve: harness.resolve })).rejects.toMatchObject({
			status: 303,
			location: '/auth/login'
		});
		expect(anonymous.locals.user).toBeNull();
		expect(anonymous.locals.session).toBeNull();
		expect(harness.getClientOptions().auth?.userStorage?.getItem('sb-example-auth-token-user')).toBeNull();
		expect(authenticatedStorage?.getItem('sb-example-auth-token-user')).toContain('"id":"user-1"');
		expect(harness.resolve).not.toHaveBeenCalled();
	});

	it('writes provider cookies through the hook with HttpOnly and root scope while retaining secure options', async () => {
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		await harness.handle(harness);

		harness.getClientOptions().cookies.setAll([
			{
				name: 'sb-example-auth-token',
				value: 'renewed-synthetic-session',
				options: { path: '/auth', httpOnly: false, secure: true, sameSite: 'lax', maxAge: 3600 }
			}
		]);

		expect(harness.event.cookies.set).toHaveBeenCalledWith('sb-example-auth-token', 'renewed-synthetic-session', {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 3600
		});
	});

	it('clears stale Supabase auth cookies when refresh token lookup fails', async () => {
		const refreshError = Object.assign(new Error('Invalid Refresh Token: Refresh Token Not Found'), {
			__isAuthError: true,
			status: 400,
			code: 'refresh_token_not_found'
		});
		const getSession = vi.fn().mockRejectedValue(refreshError);
		const createServerClient = vi.fn(() => ({
			auth: {
				getSession,
				getUser: vi.fn(),
				getClaims: vi.fn(),
				mfa: {
					getAuthenticatorAssuranceLevel: vi.fn()
				}
			},
			rpc: vi.fn()
		}));
		const deleteCookie = vi.fn();
		const resolve = vi.fn().mockResolvedValue(new Response('ok'));

		vi.doMock('@supabase/ssr', () => ({ createServerClient }));
		vi.doMock('$env/static/public', () => ({
			PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
			PUBLIC_SUPABASE_ANON_KEY: 'anon-key'
		}));
		vi.doMock('$lib/server/env', () => ({}));

		const { handle } = await import('./hooks.server');

		const response = await (handle as Handle)({
			event: {
				url: new URL('http://localhost/'),
				request: new Request('http://localhost/'),
				locals: {},
				getClientAddress: () => '127.0.0.1',
				cookies: {
					getAll: () => [
						{ name: 'sb-example-auth-token', value: 'stale-session' },
						{ name: 'sb-example-auth-token.0', value: 'stale-session-chunk' }
					],
					get: vi.fn(),
					set: vi.fn(),
					delete: deleteCookie
				}
			} as never,
			resolve
		});

		expect(response.status).toBe(200);
		expect(resolve).toHaveBeenCalled();
		expect(deleteCookie).toHaveBeenCalledWith('sb-example-auth-token', { path: '/' });
		expect(deleteCookie).toHaveBeenCalledWith('sb-example-auth-token.0', { path: '/' });
	});

	it('fails closed when the suspension RPC returns an error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { handle, event, resolve, rpc, getUser } = await createAuthenticatedHookHarness({
			data: null,
			error: { message: 'connection refused' }
		});

		await expect(handle({ event, resolve })).rejects.toMatchObject({ status: 500 });

		expect(getUser).toHaveBeenCalledWith();
		expect(rpc).toHaveBeenCalledWith('is_user_suspended', { check_user_id: 'user-1' });
		expect(resolve).not.toHaveBeenCalled();
	});

	it('redirects suspended users to /suspended', async () => {
		const { handle, event, resolve, rpc, getUser } = await createAuthenticatedHookHarness({
			data: true,
			error: null
		});

		const response = await handle({ event, resolve });

		expect(getUser).toHaveBeenCalledWith();
		expect(rpc).toHaveBeenCalledWith('is_user_suspended', { check_user_id: 'user-1' });
		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toBe('/suspended');
		expect(resolve).not.toHaveBeenCalled();
	});

	it('builds request auth state without reading the user returned by getSession', async () => {
		const { handle, event, resolve, getUser, readStoredUserDuringMfa } = await createAuthenticatedHookHarness({
			data: false,
			error: null
		});

		const response = await handle({ event, resolve });
		const locals = (event as unknown as { locals: App.Locals }).locals;

		expect(response.status).toBe(200);
		expect(getUser).toHaveBeenCalledWith();
		expect(locals.user?.id).toBe('user-1');
		expect(locals.session?.user.id).toBe('user-1');
		expect(locals.session?.access_token).toBe('token');
		expect(locals.session).not.toHaveProperty('provider_token');
		expect(locals.session).not.toHaveProperty('provider_refresh_token');
		expect(readStoredUserDuringMfa).toHaveReturnedWith(expect.stringContaining('"id":"user-1"'));
		expect(resolve).toHaveBeenCalled();
	});

	it('clears Supabase auth cookies when the authenticated user does not match verified claims', async () => {
		const { handle, event, resolve, rpc, deleteCookie } = await createAuthenticatedHookHarness(
			{
				data: false,
				error: null
			},
			{ authenticatedUserId: 'user-2' }
		);

		await expect(handle({ event, resolve })).rejects.toMatchObject({ status: 303 });

		expect(deleteCookie).toHaveBeenCalledWith('sb-example-auth-token', { path: '/' });
		expect(rpc).not.toHaveBeenCalled();
		expect(resolve).not.toHaveBeenCalled();
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies, Handle, RequestHandler } from '@sveltejs/kit';
import { POST as enrollMfa } from './routes/api/auth/mfa/enroll/+server';
import { POST as verifyMfaEnrollment } from './routes/api/auth/mfa/enroll/verify/+server';
import { POST as cancelMfaEnrollment } from './routes/api/auth/mfa/enroll/cancel/+server';
import { POST as disableMfa } from './routes/api/auth/mfa/disable/+server';
import { POST as verifyMfa } from './routes/api/auth/mfa/verify/+server';
import { GET as mfaStatus } from './routes/api/auth/mfa/status/+server';

const factorManagementRoutes = [
	{ path: '/api/auth/mfa/enroll', handler: enrollMfa, body: {} },
	{
		path: '/api/auth/mfa/enroll/verify',
		handler: verifyMfaEnrollment,
		body: { factorId: 'pending-factor', code: '123456' }
	},
	{ path: '/api/auth/mfa/enroll/cancel', handler: cancelMfaEnrollment, body: { factorId: 'pending-factor' } },
	{ path: '/api/auth/mfa/disable', handler: disableMfa, body: { code: '123456' } }
];
const completionRoutes = [
	{ path: '/api/auth/mfa/verify', handler: verifyMfa, body: { code: '123456' } },
	{ path: '/api/auth/mfa/status', handler: mfaStatus, body: undefined }
];
const mfaRoutes = [...factorManagementRoutes, ...completionRoutes];

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
		const getAuthenticatorAssuranceLevel = vi.fn(
			async (): Promise<{
				data: { currentLevel: string | null; nextLevel: string | null } | null;
				error: { message: string } | null;
			}> => {
				readStoredUserDuringMfa();
				return {
					data: { currentLevel: 'aal1', nextLevel: 'aal1' },
					error: null
				};
			}
		);
		const mfa = {
			getAuthenticatorAssuranceLevel,
			enroll: vi
				.fn()
				.mockResolvedValue({ data: { id: 'pending-factor', totp: { qr_code: 'synthetic-qr' } }, error: null }),
			listFactors: vi
				.fn()
				.mockResolvedValue({ data: { totp: [{ id: 'verified-factor', status: 'verified' }] }, error: null }),
			challengeAndVerify: vi.fn().mockResolvedValue({ error: null }),
			unenroll: vi.fn().mockResolvedValue({ error: null })
		};
		const rpc = vi.fn().mockResolvedValue(rpcResult);
		const createServerClient = vi.fn((_url: string, _key: string, options: TestServerClientOptions) => {
			serverClientOptions = options;
			return {
				auth: {
					signOut,
					getSession,
					getClaims,
					getUser,
					mfa
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
			mfa,
			event,
			createEvent,
			resolve,
			rpc,
			getSession,
			getClaims,
			getUser,
			signOut,
			getAuthenticatorAssuranceLevel,
			deleteCookie: event.cookies.delete,
			readStoredUserDuringMfa,
			getClientOptions: () => {
				if (!serverClientOptions) throw new Error('Hook has not initialized the provider');
				return serverClientOptions;
			}
		};
	}

	describe('MFA endpoint request admission', () => {
		function dispatch(route: (typeof mfaRoutes)[number]) {
			return vi.fn(async (event: Parameters<Handle>[0]['event']) => {
				event.request = new Request(
					event.url,
					route.body === undefined
						? {}
						: {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify(route.body)
							}
				);
				return (route.handler as RequestHandler)(event);
			});
		}

		function expectNoFactorChanges(harness: Awaited<ReturnType<typeof createAuthenticatedHookHarness>>) {
			expect(harness.mfa.enroll).not.toHaveBeenCalled();
			expect(harness.mfa.challengeAndVerify).not.toHaveBeenCalled();
			expect(harness.mfa.unenroll).not.toHaveBeenCalled();
		}

		it.each(mfaRoutes)('requires verified identity before dispatching $path', async (route) => {
			const harness = await createAuthenticatedHookHarness({ data: false, error: null });
			const resolve = dispatch(route);
			await expect(harness.handle({ event: harness.createEvent(route.path, {}), resolve })).rejects.toMatchObject({
				status: 303,
				location: '/auth/login'
			});
			expect(resolve).not.toHaveBeenCalled();
			expectNoFactorChanges(harness);
		});

		it.each(mfaRoutes)('rejects stale provider identity before dispatching $path', async (route) => {
			const harness = await createAuthenticatedHookHarness({ data: false, error: null });
			harness.getUser.mockResolvedValue({ data: { user: null }, error: null });
			const resolve = dispatch(route);
			await expect(harness.handle({ event: harness.createEvent(route.path), resolve })).rejects.toMatchObject({
				status: 303,
				location: '/auth/login'
			});
			expect(resolve).not.toHaveBeenCalled();
			expectNoFactorChanges(harness);
		});

		it.each(mfaRoutes)('dispatches an admitted account to the actual $path handler', async (route) => {
			const harness = await createAuthenticatedHookHarness({ data: false, error: null });
			harness.getAuthenticatorAssuranceLevel.mockResolvedValue({
				data: { currentLevel: 'aal2', nextLevel: 'aal2' },
				error: null
			});
			const response = await harness.handle({ event: harness.createEvent(route.path), resolve: dispatch(route) });
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual(
				route.path.endsWith('/status')
					? { currentLevel: 'aal2', nextLevel: 'aal2' }
					: route.path.endsWith('/enroll')
						? { factorId: 'pending-factor', qrCode: 'synthetic-qr' }
						: { ok: true }
			);
		});

		it('allows an active AAL1 account to begin its first MFA enrollment', async () => {
			const harness = await createAuthenticatedHookHarness({ data: false, error: null });
			const route = factorManagementRoutes[0];
			const response = await harness.handle({ event: harness.createEvent(route.path), resolve: dispatch(route) });
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ factorId: 'pending-factor', qrCode: 'synthetic-qr' });
			expect(harness.mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp' });
		});

		it.each(factorManagementRoutes)('blocks suspended factor management at $path', async (route) => {
			const harness = await createAuthenticatedHookHarness({ data: true, error: null });
			const resolve = dispatch(route);
			const response = await harness.handle({ event: harness.createEvent(route.path), resolve });
			expect(response.status).toBe(302);
			expect(response.headers.get('location')).toBe('/suspended');
			expect(resolve).not.toHaveBeenCalled();
			expectNoFactorChanges(harness);
		});

		describe.each([
			{ label: 'missing suspension status', result: { data: null, error: null }, throws: false },
			{
				label: 'suspension error with data',
				result: { data: false, error: { message: 'unavailable' } },
				throws: false
			},
			{ label: 'thrown suspension lookup', result: { data: false, error: null }, throws: true }
		])('$label', ({ result, throws }) => {
			it.each(factorManagementRoutes)('denies $path without factor changes', async (route) => {
				vi.spyOn(console, 'error').mockImplementation(() => undefined);
				const harness = await createAuthenticatedHookHarness(result);
				if (throws) harness.rpc.mockRejectedValue(new Error('provider unavailable'));
				const resolve = dispatch(route);
				const attempt = harness.handle({ event: harness.createEvent(route.path), resolve });
				if (throws) await expect(attempt).rejects.toThrow('provider unavailable');
				else await expect(attempt).rejects.toMatchObject({ status: 500 });
				expect(resolve).not.toHaveBeenCalled();
				expectNoFactorChanges(harness);
			});
		});

		describe.each([
			{ flow: null, location: '/auth/mfa-verify' },
			{ flow: 'recovery', location: '/auth/reset-password' },
			{ flow: 'invite', location: '/auth/accept-invite' }
		])('incomplete $flow session', ({ flow, location }) => {
			it.each(factorManagementRoutes)('cannot change factors through $path', async (route) => {
				const harness = await createAuthenticatedHookHarness({ data: false, error: null });
				harness.getAuthenticatorAssuranceLevel.mockResolvedValue({
					data: { currentLevel: 'aal1', nextLevel: 'aal2' },
					error: null
				});
				const event = harness.createEvent(route.path, {
					'sb-example-auth-token': 'session',
					...(flow ? { ttt_pending_auth_flow: flow } : {})
				});
				const resolve = dispatch(route);
				await expect(harness.handle({ event, resolve })).rejects.toMatchObject({ status: 303, location });
				expect(resolve).not.toHaveBeenCalled();
				expectNoFactorChanges(harness);
			});
		});

		describe.each([null, 'recovery'])('completion with flow %s', (flow) => {
			it.each(completionRoutes)('lets a suspended pending-MFA account complete via $path', async (route) => {
				const harness = await createAuthenticatedHookHarness({ data: true, error: null });
				harness.getAuthenticatorAssuranceLevel.mockResolvedValue({
					data: { currentLevel: 'aal1', nextLevel: 'aal2' },
					error: null
				});
				const event = harness.createEvent(route.path, {
					'sb-example-auth-token': 'session',
					...(flow ? { ttt_pending_auth_flow: flow } : {})
				});
				const response = await harness.handle({ event, resolve: dispatch(route) });
				expect(response.status).toBe(200);
				expect(await response.json()).toEqual(
					route.path.endsWith('/status') ? { currentLevel: 'aal1', nextLevel: 'aal2' } : { ok: true }
				);
				expect(harness.mfa.enroll).not.toHaveBeenCalled();
				expect(harness.mfa.unenroll).not.toHaveBeenCalled();
			});
		});

		it.each(completionRoutes)('keeps invite sessions on their own completion path at $path', async (route) => {
			const harness = await createAuthenticatedHookHarness({ data: false, error: null });
			const event = harness.createEvent(route.path, {
				'sb-example-auth-token': 'session',
				ttt_pending_auth_flow: 'invite'
			});
			const resolve = dispatch(route);
			await expect(harness.handle({ event, resolve })).rejects.toMatchObject({
				status: 303,
				location: '/auth/accept-invite'
			});
			expect(resolve).not.toHaveBeenCalled();
			expectNoFactorChanges(harness);
		});

		it.each(mfaRoutes)('denies unavailable assurance before dispatching $path', async (route) => {
			vi.spyOn(console, 'error').mockImplementation(() => undefined);
			const harness = await createAuthenticatedHookHarness({ data: false, error: null });
			harness.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
			const resolve = dispatch(route);
			await expect(harness.handle({ event: harness.createEvent(route.path), resolve })).rejects.toMatchObject({
				status: 503
			});
			expect(resolve).not.toHaveBeenCalled();
			expectNoFactorChanges(harness);
		});
	});

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

	it.each([
		{ label: 'returned error', result: { data: null, error: { message: 'provider unavailable' } } },
		{
			label: 'error alongside data',
			result: { data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: { message: 'provider unavailable' } }
		},
		{ label: 'missing data', result: { data: null, error: null } },
		{ label: 'missing session levels', result: { data: { currentLevel: null, nextLevel: null }, error: null } },
		{ label: 'unknown level', result: { data: { currentLevel: 'unknown', nextLevel: 'aal2' }, error: null } }
	])('denies protected writes when MFA assurance is unverifiable: $label', async ({ result }) => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		harness.getAuthenticatorAssuranceLevel.mockResolvedValue(result);
		const event = harness.createEvent('/org/organization-a/api/personnel');

		await expect(harness.handle({ event, resolve: harness.resolve })).rejects.toMatchObject({
			status: 503,
			body: { message: 'Unable to verify authentication status' }
		});
		expect(harness.resolve).not.toHaveBeenCalled();
	});

	it('denies protected writes when the MFA provider throws', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		harness.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('provider unavailable'));
		await expect(harness.handle(harness)).rejects.toMatchObject({ status: 503 });
		expect(harness.resolve).not.toHaveBeenCalled();
	});

	it('admits a later request after assurance verification recovers without discarding its session', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		harness.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({ data: null, error: { message: 'unavailable' } });
		await expect(harness.handle(harness)).rejects.toMatchObject({ status: 503 });
		expect(harness.resolve).not.toHaveBeenCalled();
		expect(harness.event.cookies.get('sb-example-auth-token')).toBe('session');
		expect(harness.signOut).not.toHaveBeenCalled();
		expect((await harness.handle({ event: harness.createEvent(), resolve: harness.resolve })).status).toBe(200);
		expect(harness.resolve).toHaveBeenCalled();
	});

	it.each(['/org/organization-a/api/personnel', '/account', '/api/auth/mfa/enroll', '/api/auth/mfa/disable'])(
		'redirects pending MFA before dispatching %s',
		async (path) => {
			const harness = await createAuthenticatedHookHarness({ data: false, error: null });
			harness.getAuthenticatorAssuranceLevel.mockResolvedValue({
				data: { currentLevel: 'aal1', nextLevel: 'aal2' },
				error: null
			});
			await expect(
				harness.handle({ event: harness.createEvent(path), resolve: harness.resolve })
			).rejects.toMatchObject({ status: 303, location: '/auth/mfa-verify' });
			expect(harness.resolve).not.toHaveBeenCalled();
		}
	);

	it.each(['/auth/mfa-verify', '/api/auth/mfa/status', '/api/auth/mfa/verify', '/auth/logout'])(
		'allows pending MFA continuation at %s',
		async (path) => {
			const harness = await createAuthenticatedHookHarness({ data: false, error: null });
			harness.getAuthenticatorAssuranceLevel.mockResolvedValue({
				data: { currentLevel: 'aal1', nextLevel: 'aal2' },
				error: null
			});
			expect((await harness.handle({ event: harness.createEvent(path), resolve: harness.resolve })).status).toBe(200);
			expect(harness.resolve).toHaveBeenCalled();
		}
	);

	it.each(['aal1', 'aal2'])('admits completed %s assurance to a protected handler', async (level) => {
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		harness.getAuthenticatorAssuranceLevel.mockResolvedValue({
			data: { currentLevel: level, nextLevel: level },
			error: null
		});
		expect((await harness.handle(harness)).status).toBe(200);
		expect(harness.event.locals.mfaPending).toBe(false);
		expect(harness.resolve).toHaveBeenCalled();
	});

	it.each([
		{ flow: 'recovery', destination: '/auth/reset-password', path: '/org/organization-a/api/personnel' },
		{ flow: 'invite', destination: '/auth/accept-invite', path: '/org/organization-a/api/personnel' },
		{ flow: 'recovery', destination: '/auth/reset-password', path: '/api/auth/finalize-invite' },
		{ flow: 'invite', destination: '/auth/accept-invite', path: '/api/auth/mfa/enroll' },
		{ flow: 'invite', destination: '/auth/accept-invite', path: '/auth/reset-password' }
	])('restricts $flow sessions before dispatching $path', async ({ flow, destination, path }) => {
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		const event = harness.createEvent(path, { 'sb-example-auth-token': 'session', ttt_pending_auth_flow: flow });
		await expect(harness.handle({ event, resolve: harness.resolve })).rejects.toMatchObject({
			status: 303,
			location: destination
		});
		expect(harness.resolve).not.toHaveBeenCalled();
	});

	it.each([
		{ flow: 'recovery', path: '/auth/reset-password' },
		{ flow: 'recovery', path: '/api/auth/mfa/verify' },
		{ flow: 'recovery', path: '/api/auth/update-password' },
		{ flow: 'recovery', path: '/auth/logout' },
		{ flow: 'invite', path: '/auth/accept-invite' },
		{ flow: 'invite', path: '/api/auth/update-password' },
		{ flow: 'invite', path: '/api/auth/finalize-invite' },
		{ flow: 'invite', path: '/auth/logout' }
	])('allows $flow completion at $path while MFA is pending', async ({ flow, path }) => {
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		harness.getAuthenticatorAssuranceLevel.mockResolvedValue({
			data: { currentLevel: 'aal1', nextLevel: 'aal2' },
			error: null
		});
		const event = harness.createEvent(path, { 'sb-example-auth-token': 'session', ttt_pending_auth_flow: flow });
		expect((await harness.handle({ event, resolve: harness.resolve })).status).toBe(200);
		expect(harness.resolve).toHaveBeenCalled();
	});

	it.each(['recovery', 'invite'])('does not let a %s cookie bypass an assurance lookup failure', async (flow) => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		harness.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
		const event = harness.createEvent('/api/auth/update-password', {
			'sb-example-auth-token': 'session',
			ttt_pending_auth_flow: flow
		});
		await expect(harness.handle({ event, resolve: harness.resolve })).rejects.toMatchObject({ status: 503 });
		expect(harness.resolve).not.toHaveBeenCalled();
	});

	it.each([null, 'recovery', 'invite'])('allows real logout during an assurance outage with flow %s', async (flow) => {
		const harness = await createAuthenticatedHookHarness({ data: true, error: null });
		harness.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('provider unavailable'));
		const event = harness.createEvent('/auth/logout', {
			'sb-example-auth-token': 'session',
			...(flow ? { ttt_pending_auth_flow: flow } : {})
		});
		const { actions } = await import('./routes/auth/logout/+page.server');
		const resolve = vi.fn(async (event: Parameters<Handle>[0]['event']) => {
			await actions.default({ ...event, params: {}, route: { id: '/auth/logout' } });
			return new Response('unreachable');
		});
		await expect(harness.handle({ event, resolve })).rejects.toMatchObject({ status: 303, location: '/' });
		expect(harness.signOut).toHaveBeenCalled();
		expect(event.cookies.get('ttt_pending_auth_flow')).toBeUndefined();
	});

	it.each(['/org/organization-a/api/personnel', '/api/announcements/dismiss'])(
		'blocks a suspended user before the protected mutation at %s',
		async (path) => {
			const harness = await createAuthenticatedHookHarness({ data: true, error: null });
			const response = await harness.handle({ event: harness.createEvent(path), resolve: harness.resolve });
			expect(response.status).toBe(302);
			expect(response.headers.get('location')).toBe('/suspended');
			expect(harness.resolve).not.toHaveBeenCalled();
		}
	);

	it.each(['/suspended', '/auth/logout', '/auth/mfa-verify'])(
		'keeps the suspended user exit or completion path %s reachable',
		async (path) => {
			const harness = await createAuthenticatedHookHarness({ data: true, error: null });
			expect((await harness.handle({ event: harness.createEvent(path), resolve: harness.resolve })).status).toBe(200);
			expect(harness.resolve).toHaveBeenCalled();
		}
	);

	it('denies a protected write when suspension status is missing', async () => {
		const harness = await createAuthenticatedHookHarness({ data: null, error: null });
		await expect(harness.handle(harness)).rejects.toMatchObject({
			status: 500,
			body: { message: 'Unable to verify account status' }
		});
		expect(harness.resolve).not.toHaveBeenCalled();
	});

	it('denies a protected write when the suspension provider throws', async () => {
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		harness.rpc.mockRejectedValue(new Error('provider unavailable'));
		await expect(harness.handle(harness)).rejects.toThrow('provider unavailable');
		expect(harness.resolve).not.toHaveBeenCalled();
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

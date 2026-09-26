import { attemptStore } from './tests/fixtures/passwordAttempt';
import { parse } from 'devalue';
vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({ rpc: attemptStore.rpc }) }));
vi.mock('$env/dynamic/private', () => ({ env: { ACCOUNT_SETUP_SESSION_SECRET: 'synthetic-receipt-secret' } }));
import { passwordSessionToken } from './tests/fixtures/passwordSession';
import { setCompletedAuthFlowCookie, setPendingAuthFlowCookie } from './features/identity/index.server';
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

function signedFlow(flow: string, sessionId = '00000000-0000-4000-8000-000000000001'): string {
	if (flow !== 'recovery' && flow !== 'invite' && flow !== 'complete') throw new Error('Invalid synthetic auth flow');
	let marker: string | undefined;
	const cookies = {
		set: (_name: string, value: string) => {
			marker = value;
		}
	} as Pick<Cookies, 'set'>;
	const session = {
		access_token: passwordSessionToken('user-1', 'admitted', sessionId, 'otp'),
		user: { id: 'user-1' }
	};
	const issued =
		flow === 'complete'
			? setCompletedAuthFlowCookie(cookies, session, { id: 'user-1' })
			: setPendingAuthFlowCookie(cookies, flow, session, { id: 'user-1' });
	if (!issued || !marker) throw new Error('Unable to issue synthetic auth flow');
	return marker;
}

interface TestServerClientOptions {
	cookies: {
		setAll(cookies: { name: string; value: string; options: Parameters<Cookies['set']>[2] }[]): void;
	};
	auth?: {
		userStorage?: TestUserStorage;
	};
}

describe('server auth hook', () => {
	it('keeps restrictive response security policy after payment-provider retirement', async () => {
		const { handle, createEvent, resolve } = await createAuthenticatedHookHarness({ data: false, error: null });
		const response = await handle({ event: createEvent('/auth/login', {}), resolve });
		const directives = new Map(
			(response.headers.get('Content-Security-Policy') ?? '').split(';').map((directive) => {
				const [name, ...sources] = directive.trim().split(/\s+/);
				return [name, sources];
			})
		);

		expect(directives.get('default-src')).toEqual(["'self'"]);
		expect(directives.get('frame-src')).toEqual(["'none'"]);
		expect(directives.get('script-src')).toEqual(
			expect.arrayContaining(["'self'", "'unsafe-inline'", 'https://va.vercel-scripts.com'])
		);
		expect(directives.get('script-src')).not.toEqual(expect.arrayContaining(['https://js.stripe.com']));
		expect(directives.get('connect-src')).toEqual(
			expect.arrayContaining(["'self'", 'https://*.supabase.co', 'https://vitals.vercel-insights.com'])
		);
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});

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
			error?: { message: string } | null;
		},
		options: {
			authenticatedUserId?: string;
			lastSignInAt?: string;
			sessionStartedAt?: string;
			authMethod?: 'password' | 'otp';
		} = {}
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
			access_token: passwordSessionToken(
				'user-1',
				'admitted',
				'00000000-0000-4000-8000-000000000001',
				options.authMethod
			),
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
		const signInWithPassword = vi.fn().mockResolvedValue({
			data: {
				user,
				session: {
					user,
					access_token: 'proof-token',
					refresh_token: 'proof-refresh',
					expires_at: now.getTime() / 1000 + 3600
				}
			},
			error: null
		});
		const updateUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
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
			enroll: vi.fn().mockResolvedValue({
				data: { id: 'pending-factor', type: 'totp', totp: { qr_code: 'synthetic-qr' } },
				error: null
			}),
			listFactors: vi.fn().mockResolvedValue({
				data: {
					all: [
						{ id: 'pending-factor', factor_type: 'totp', status: 'unverified' },
						{ id: 'verified-factor', factor_type: 'totp', status: 'verified' }
					],
					totp: [{ id: 'verified-factor', status: 'verified' }]
				},
				error: null
			}),
			challengeAndVerify: vi.fn().mockResolvedValue({
				data: { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' },
				error: null
			}),
			unenroll: vi.fn(async ({ factorId }: { factorId: string }) => ({ data: { id: factorId }, error: null }))
		};
		const rpc = vi.fn().mockResolvedValue(rpcResult);
		const sessionLookup = vi
			.fn()
			.mockResolvedValue({ data: options.sessionStartedAt ?? now.toISOString(), error: null });
		const createServerClient = vi.fn((_url: string, _key: string, options: TestServerClientOptions) => {
			serverClientOptions = options;
			return {
				auth: {
					signOut,
					admin: { signOut },
					signInWithPassword,
					updateUser,
					getSession,
					getClaims,
					getUser,
					mfa
				},
				rpc: (name: string, ...args: unknown[]) =>
					name === 'get_current_session_started_at'
						? { setHeader: (header: string, value: string) => sessionLookup(header, value) }
						: rpc(name, ...args)
			};
		});
		const resolve = vi.fn().mockResolvedValue(new Response('ok'));

		vi.doMock('@supabase/supabase-js', () => ({
			createClient: () => ({
				auth: {
					signInWithPassword,
					getUser,
					mfa: {
						getAuthenticatorAssuranceLevel: vi
							.fn()
							.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
					},
					signOut: vi.fn().mockResolvedValue({ error: null }),
					admin: { signOut: vi.fn().mockResolvedValue({ error: null }) }
				}
			})
		}));
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
			sessionLookup,
			createServerClient,
			getSession,
			getClaims,
			getUser,
			signOut,
			signInWithPassword,
			updateUser,
			getAuthenticatorAssuranceLevel,
			deleteCookie: event.cookies.delete,
			readStoredUserDuringMfa,
			getClientOptions: () => {
				if (!serverClientOptions) throw new Error('Hook has not initialized the provider');
				return serverClientOptions;
			}
		};
	}

	describe('invite finalization admission through the request hook', () => {
		const accept = vi.fn();
		const profile = vi.fn();
		beforeEach(() => {
			attemptStore.row = {
				actor: 'user-1',
				session: '00000000-0000-4000-8000-000000000001',
				id: '00000000-0000-4000-8000-000000000099',
				flow: 'invite',
				state: 'complete',
				expiresAt: NOW.getTime() / 1000 + 3600,
				acquired: false
			};
			accept.mockReset().mockResolvedValue({ accepted: 1 });
			profile.mockReset().mockResolvedValue(undefined);
			vi.doMock('$lib/server/auto-accept-org-invites', () => ({ autoAcceptOrgInvites: accept }));
			vi.doMock('$features/identity/index.server', async (original) => ({
				...(await original<typeof import('$features/identity/index.server')>()),
				parseUserProfileForm: () => ({ firstName: 'Jane', lastName: 'Smith', rank: 'SGT' }),
				upsertUserProfile: profile
			}));
		});
		afterEach(() => {
			vi.doUnmock('$lib/server/auto-accept-org-invites');
			vi.doUnmock('$features/identity/index.server');
		});
		it.each(['pending at hook', 'newly pending', 'unavailable after hook'])(
			'denies finalization for %s without writes or clearing the invite marker, then retries',
			async (mode) => {
				// Auth completion retains its existing availability for suspended accounts.
				const h = await createAuthenticatedHookHarness({ data: true, error: null });
				const { POST } = await import('./routes/api/auth/finalize-invite/+server');
				const complete = { data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null };
				const pending = { data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null };
				h.getAuthenticatorAssuranceLevel
					.mockResolvedValue(complete)
					.mockResolvedValueOnce(mode === 'pending at hook' ? pending : complete)
					.mockResolvedValueOnce(
						mode === 'unavailable after hook' ? { data: null, error: { message: 'private' } } : pending
					);
				const event = h.createEvent('/api/auth/finalize-invite', {
					'sb-example-auth-token': 'session',
					ttt_pending_auth_flow: signedFlow('invite')
				});
				const dispatch = (event: Parameters<Handle>[0]['event']) => POST(event as Parameters<typeof POST>[0]);
				const response = await h.handle({ event, resolve: dispatch });
				expect(response.status).toBe(mode === 'unavailable after hook' ? 503 : 403);
				expect(profile).not.toHaveBeenCalled();
				expect(accept).not.toHaveBeenCalled();
				expect(event.cookies.get('ttt_pending_auth_flow')).toBe(signedFlow('invite'));
				expect(event.cookies.set).not.toHaveBeenCalled();
				const retry = await h.handle({ event, resolve: dispatch });
				expect(retry.status).toBe(200);
				expect(accept).toHaveBeenCalledExactlyOnceWith(expect.any(Object), 'user@example.com');
				expect(profile).toHaveBeenCalledTimes(1);
				expect(event.cookies.get('ttt_pending_auth_flow')).toBe(signedFlow('complete'));
				const replay = await h.handle({ event, resolve: dispatch });
				expect(replay.status).toBe(403);
				expect(accept).toHaveBeenCalledTimes(1);
			}
		);
	});

	describe('password update identity admission', () => {
		const limit = vi.fn();
		beforeEach(() => {
			limit.mockReset().mockResolvedValue({ limited: false });
			vi.doMock('$features/identity/passwordUpdateRateLimit.server', () => ({
				checkPasswordUpdateRateLimit: limit
			}));
		});
		afterEach(() => vi.doUnmock('$features/identity/passwordUpdateRateLimit.server'));

		it('does not skip current-password proof for a forged recovery cookie', async () => {
			const h = await createAuthenticatedHookHarness({ data: false, error: null });
			const { POST } = await import('./routes/api/auth/update-password/+server');
			const event = h.createEvent('/api/auth/update-password', {
				'sb-example-auth-token': 'session',
				ttt_pending_auth_flow: 'recovery'
			});
			event.request = new Request(event.url, {
				method: 'POST',
				body: JSON.stringify({ password: 'NewSecurePass12' })
			});
			const response = await h.handle({ event, resolve: (event) => POST(event as Parameters<typeof POST>[0]) });
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: 'Current password is required' });
			expect(h.updateUser).not.toHaveBeenCalled();
			expect(event.locals.authFlow).toBeNull();
		});

		it.each([null, 'recovery', 'invite'])('supplies bound session identity to the real %s handler', async (flow) => {
			const h = await createAuthenticatedHookHarness({ data: false, error: null });
			const { POST } = await import('./routes/api/auth/update-password/+server');
			const event = h.createEvent('/api/auth/update-password', {
				'sb-example-auth-token': 'session',
				...(flow ? { ttt_pending_auth_flow: signedFlow(flow) } : {})
			});
			event.request = new Request(event.url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(
					flow
						? { password: 'NewSecurePass12' }
						: {
								currentPassword: 'OldSecurePass12',
								password: 'NewSecurePass12',
								confirmPassword: 'NewSecurePass12'
							}
				)
			});
			const response = await h.handle({ event, resolve: (event) => POST(event as Parameters<typeof POST>[0]) });
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ ok: true });
			expect(limit).toHaveBeenCalledWith({ userId: 'user-1', ip: '127.0.0.1' });
			expect(h.updateUser).toHaveBeenCalledExactlyOnceWith({
				password: 'NewSecurePass12',
				data: { ttt_password_attempt: '00000000-0000-4000-8000-000000000099' }
			});
			if (flow) expect(h.signInWithPassword).not.toHaveBeenCalled();
			else
				expect(h.signInWithPassword).toHaveBeenCalledWith({ email: 'user@example.com', password: 'OldSecurePass12' });
			expect(event.cookies.get('ttt_pending_auth_flow')).toBe(
				flow === 'invite' ? signedFlow('invite') : flow === 'recovery' ? signedFlow('complete') : undefined
			);
		});

		it.each([null, 'recovery', 'invite'])(
			'denies newly pending mutation MFA through the real %s hook and retries',
			async (flow) => {
				const h = await createAuthenticatedHookHarness({ data: true, error: null });
				const { POST } = await import('./routes/api/auth/update-password/+server');
				let reads = 0;
				h.getAuthenticatorAssuranceLevel.mockImplementation(async () => ({
					data: { currentLevel: ++reads === 2 ? 'aal1' : 'aal2', nextLevel: 'aal2' },
					error: null
				}));
				const request = () => {
					const event = h.createEvent('/api/auth/update-password', {
						'sb-example-auth-token': 'session',
						...(flow ? { ttt_pending_auth_flow: signedFlow(flow) } : {})
					});
					event.request = new Request(event.url, {
						method: 'POST',
						body: JSON.stringify({
							currentPassword: 'OldSecurePass12',
							password: 'NewSecurePass12',
							confirmPassword: 'NewSecurePass12'
						})
					});
					return event;
				};
				const event = request();
				const response = await h.handle({ event, resolve: (event) => POST(event as Parameters<typeof POST>[0]) });
				expect(response.status).toBe(403);
				expect(await response.json()).toMatchObject({ code: 'mfa_required' });
				expect(h.updateUser).not.toHaveBeenCalled();
				expect(h.signOut).not.toHaveBeenCalled();
				expect(event.cookies.get('ttt_pending_auth_flow')).toBe(flow ? signedFlow(flow) : undefined);
				const retry = await h.handle({
					event: request(),
					resolve: (event) => POST(event as Parameters<typeof POST>[0])
				});
				expect(retry.status).toBe(200);
				expect(h.updateUser).toHaveBeenCalledExactlyOnceWith({
					password: 'NewSecurePass12',
					data: { ttt_password_attempt: '00000000-0000-4000-8000-000000000099' }
				});
			}
		);

		it.each(['recovery', 'invite'])(
			'resumes %s revocation through admission after a received partial response and reload',
			async (flow) => {
				const h = await createAuthenticatedHookHarness({ data: false, error: null });
				const { POST } = await import('./routes/api/auth/update-password/+server');
				h.signOut.mockResolvedValueOnce({ error: { message: 'Unavailable' } });
				const initial = h.createEvent('/api/auth/update-password', {
					'sb-example-auth-token': 'session',
					ttt_pending_auth_flow: signedFlow(flow)
				});
				initial.request = new Request(initial.url, {
					method: 'POST',
					body: JSON.stringify({ password: 'NewSecurePass12' })
				});
				const partial = await h.handle({
					event: initial,
					resolve: (event) => POST(event as Parameters<typeof POST>[0])
				});
				expect(partial.status).toBe(202);
				expect(initial.cookies.get('ttt_pending_auth_flow')).toBe(signedFlow(flow));
				const reloaded = h.createEvent(
					'/api/auth/update-password',
					Object.fromEntries(initial.cookies.getAll().map(({ name, value }) => [name, value]))
				);
				reloaded.request = new Request(reloaded.url, { method: 'POST', body: JSON.stringify({ action: 'complete' }) });
				const completed = await h.handle({
					event: reloaded,
					resolve: (event) => POST(event as Parameters<typeof POST>[0])
				});
				expect(completed.status).toBe(200);
				expect(h.updateUser).toHaveBeenCalledExactlyOnceWith({
					password: 'NewSecurePass12',
					data: { ttt_password_attempt: '00000000-0000-4000-8000-000000000099' }
				});
				expect(h.signOut.mock.calls).toEqual([
					[passwordSessionToken('user-1'), 'others'],
					[passwordSessionToken('user-1'), 'others']
				]);
				expect(reloaded.cookies.get('ttt_pending_auth_flow')).toBe(
					flow === 'invite' ? signedFlow('invite') : flow === 'recovery' ? signedFlow('complete') : undefined
				);
			}
		);

		it('denies anonymous requests at the public password-update handler without provider effects', async () => {
			const h = await createAuthenticatedHookHarness({ data: false, error: null });
			const { POST } = await import('./routes/api/auth/update-password/+server');
			const event = h.createEvent('/api/auth/update-password', {});
			event.request = new Request(event.url, { method: 'POST', body: JSON.stringify({ password: 'NewSecurePass12' }) });
			const response = await h.handle({ event, resolve: (event) => POST(event as Parameters<typeof POST>[0]) });
			expect(response.status).toBe(401);
			expect(limit).not.toHaveBeenCalled();
			expect(h.signInWithPassword).not.toHaveBeenCalled();
			expect(h.updateUser).not.toHaveBeenCalled();
			expect(h.signOut).not.toHaveBeenCalled();
		});
	});

	describe('request throttle admission', () => {
		const auditLog = vi.fn();
		beforeEach(() => {
			vi.doMock('$lib/server/auditLog', () => ({ auditLog }));
			auditLog.mockClear();
		});
		afterEach(() => {
			vi.doUnmock('$lib/server/auditLog');
			vi.unstubAllEnvs();
		});

		it.each([
			{ path: '/auth/login', limit: 10, windowMs: 900_000, anonymous: true },
			{ path: '/api/auth/confirm-sensitive-action', limit: 60, windowMs: 60_000, anonymous: false }
		])(
			'enforces $path before provider/dispatch effects and permits reset retries',
			async ({ path, limit, windowMs, anonymous }) => {
				const harness = await createAuthenticatedHookHarness({ data: false, error: null });
				if (anonymous) harness.getSession.mockResolvedValue({ data: { session: null }, error: null });
				const request = (ip = '198.51.100.1') => {
					const event = harness.createEvent(path, anonymous ? {} : undefined);
					event.getClientAddress = () => ip;
					return event;
				};
				for (let attempt = 0; attempt < limit; attempt++) {
					expect((await harness.handle({ event: request(), resolve: harness.resolve })).status).toBe(200);
				}
				vi.clearAllMocks();
				vi.setSystemTime(NOW.getTime() + 1_234);
				const denied = request();
				const response = await harness.handle({ event: denied, resolve: harness.resolve });
				expect(response.status).toBe(429);
				expect(response.headers.get('Content-Type')).toBe('application/json');
				expect(response.headers.get('Retry-After')).toBe(anonymous ? '899' : '59');
				expect(await response.json()).toEqual({ error: 'Too many requests' });
				expect(harness.createServerClient).not.toHaveBeenCalled();
				expect(harness.getSession).not.toHaveBeenCalled();
				expect(harness.rpc).not.toHaveBeenCalled();
				expect(harness.resolve).not.toHaveBeenCalled();
				expect(denied.cookies.set).not.toHaveBeenCalled();
				expect(denied.cookies.delete).not.toHaveBeenCalled();
				expect(auditLog).toHaveBeenCalledWith(
					expect.objectContaining({
						action: 'security.rate_limit_exceeded',
						severity: 'warning',
						details: { pathname: path, method: 'POST' }
					}),
					{ userId: null, ip: '198.51.100.1' }
				);
				expect((await harness.handle({ event: request('198.51.100.2'), resolve: harness.resolve })).status).toBe(200);
				vi.setSystemTime(NOW.getTime() + windowMs);
				expect((await harness.handle({ event: request(), resolve: harness.resolve })).status).toBe(200);
			}
		);

		it('returns an action failure that an enhanced login form can display when throttled', async () => {
			const harness = await createAuthenticatedHookHarness({ data: false, error: null });
			const request = () => {
				const event = harness.createEvent('/auth/login', {});
				event.getClientAddress = () => '198.51.100.15';
				event.request = new Request(event.url, {
					method: 'POST',
					headers: { 'x-sveltekit-action': 'true' }
				});
				return event;
			};
			for (let attempt = 0; attempt < 10; attempt++) {
				expect((await harness.handle({ event: request(), resolve: harness.resolve })).status).toBe(200);
			}
			vi.clearAllMocks();
			const response = await harness.handle({ event: request(), resolve: harness.resolve });
			expect(response.status).toBe(429);
			expect(response.headers.get('Retry-After')).toBe('900');
			const result = await response.json();
			expect(result).toMatchObject({ type: 'failure', status: 429 });
			expect(parse(result.data)).toEqual({ error: 'Too many requests. Please wait and try again.' });
			expect(harness.resolve).not.toHaveBeenCalled();
			expect(harness.createServerClient).not.toHaveBeenCalled();
		});
	});

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
			{ label: 'missing suspension acknowledgment', result: { data: false }, throws: false },
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
				const event = harness.createEvent(route.path);
				const attempt = harness.handle({ event, resolve });
				await expect(attempt).rejects.toMatchObject({
					status: 500,
					body: { message: 'Unable to verify account status' }
				});
				expect(resolve).not.toHaveBeenCalled();
				expect(event.locals.actor).toBeNull();
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
					...(flow ? { ttt_pending_auth_flow: signedFlow(flow) } : {})
				});
				const resolve = dispatch(route);
				await expect(harness.handle({ event, resolve })).rejects.toMatchObject({ status: 303, location });
				expect(resolve).not.toHaveBeenCalled();
				expectNoFactorChanges(harness);
			});
		});

		describe.each([null, 'recovery', 'invite'])('completion with flow %s', (flow) => {
			it.each(completionRoutes)('lets a suspended pending-MFA account complete via $path', async (route) => {
				const harness = await createAuthenticatedHookHarness({ data: true, error: null });
				harness.getAuthenticatorAssuranceLevel.mockResolvedValue({
					data: { currentLevel: 'aal1', nextLevel: 'aal2' },
					error: null
				});
				const event = harness.createEvent(route.path, {
					'sb-example-auth-token': 'session',
					...(flow ? { ttt_pending_auth_flow: signedFlow(flow) } : {})
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
				ttt_pending_auth_flow: signedFlow('invite')
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
			{ sessionStartedAt: '2026-09-15T12:00:01Z' }
		);

		expect((await harness.handle(harness)).status).toBe(200);
		expect(harness.event.locals.user?.id).toBe('user-1');
		expect(harness.signOut).not.toHaveBeenCalled();
		expect(harness.resolve).toHaveBeenCalled();
	});

	it('revokes a session past its absolute lifetime before a protected write', async () => {
		const harness = await createAuthenticatedHookHarness(
			{ data: false, error: null },
			{ sessionStartedAt: '2026-09-15T11:59:59Z' }
		);
		const event = harness.createEvent('/dashboard', {
			'sb-example-auth-token': 'expired-session',
			ttt_pending_auth_flow: signedFlow('recovery')
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

	describe('session-specific absolute timeout', () => {
		it('keeps separate starts for two sessions of the same account despite a newer account sign-in', async () => {
			const h = await createAuthenticatedHookHarness({ data: false, error: null });
			h.sessionLookup.mockResolvedValueOnce({ data: '2026-09-15T12:00:00Z', error: null });
			await expect(h.handle(h)).rejects.toMatchObject({ status: 303, location: '/auth/login' });
			expect(h.resolve).not.toHaveBeenCalled();
			expect(h.event.locals.session).toBeNull();
			expect(h.event.locals.user).toBeNull();
			// A separately verified current session has its own provider start fact.
			const current = h.createEvent();
			expect((await h.handle({ event: current, resolve: h.resolve })).status).toBe(200);
			expect(current.locals.user?.id).toBe('user-1');
		});

		it.each(['refresh', 'MFA'])('does not renew session age on %s', async (kind) => {
			const h = await createAuthenticatedHookHarness(
				{ data: false, error: null },
				{ sessionStartedAt: '2026-09-15T11:59:59Z' }
			);
			const claims = (await h.getClaims()).data.claims;
			h.getClaims.mockResolvedValue({
				data: { claims: { ...claims, iat: NOW.getTime() / 1000, aal: kind === 'MFA' ? 'aal2' : 'aal1' } },
				error: null
			});
			await expect(h.handle(h)).rejects.toMatchObject({ status: 303 });
			expect(h.resolve).not.toHaveBeenCalled();
			expect(h.sessionLookup).toHaveBeenCalledWith('Authorization', `Bearer ${passwordSessionToken('user-1')}`);
		});

		it.each([undefined, '', 'invalid', '2026-09-17T12:00:00Z'])(
			'ignores account-wide start metadata %s for a valid session',
			async (lastSignInAt) => {
				const h = await createAuthenticatedHookHarness({ data: false, error: null });
				const user = (await h.getUser()).data.user;
				h.getUser.mockResolvedValue({ data: { user: { ...user, last_sign_in_at: lastSignInAt } }, error: null });
				expect((await h.handle(h)).status).toBe(200);
				expect(h.signOut).not.toHaveBeenCalled();
			}
		);

		it.each([
			undefined,
			{},
			{ data: true, error: null },
			{ data: '', error: null },
			{ data: 'yesterday', error: null },
			{ data: '2026-09-16', error: null },
			{ data: '2026-09-16T12:00:00.001Z', error: null },
			{ data: NOW.toISOString(), error: { message: 'unavailable' } }
		])('denies unavailable or malformed session start facts and permits retry: %j', async (result) => {
			const h = await createAuthenticatedHookHarness({ data: false, error: null });
			h.sessionLookup.mockResolvedValueOnce(result);
			await expect(h.handle(h)).rejects.toMatchObject({ status: 503 });
			expect(h.resolve).not.toHaveBeenCalled();
			expect(h.signOut).not.toHaveBeenCalled();
			expect((await h.handle({ event: h.createEvent(), resolve: h.resolve })).status).toBe(200);
		});

		it('denies a thrown provider read without clearing pending recovery and keeps logout reachable', async () => {
			const h = await createAuthenticatedHookHarness({ data: false, error: null });
			h.sessionLookup.mockRejectedValue(new Error('unavailable'));
			const event = h.createEvent('/api/auth/update-password', {
				'sb-example-auth-token': 'session',
				ttt_pending_auth_flow: signedFlow('recovery')
			});
			await expect(h.handle({ event, resolve: h.resolve })).rejects.toMatchObject({ status: 503 });
			expect(h.resolve).not.toHaveBeenCalled();
			expect(event.cookies.get('ttt_pending_auth_flow')).toBe(signedFlow('recovery'));
			const { actions } = await import('./routes/auth/logout/+page.server');
			await expect(
				h.handle({
					event: h.createEvent('/auth/logout'),
					resolve: async (event) => {
						await actions.default({ ...event, params: {}, route: { id: '/auth/logout' } });
						return new Response('unreachable');
					}
				})
			).rejects.toMatchObject({ status: 303, location: '/' });
		});

		it('denies a missing provider session, clears only this project cookies and clears admitted identity', async () => {
			const h = await createAuthenticatedHookHarness({ data: false, error: null });
			h.sessionLookup.mockResolvedValue({ data: null, error: null });
			const event = h.createEvent('/auth/login', {
				'sb-example-auth-token.0': 'session',
				'sb-other-auth-token': 'unrelated',
				ttt_pending_auth_flow: signedFlow('invite'),
				theme: 'dark'
			});
			expect((await h.handle({ event, resolve: h.resolve })).status).toBe(200);
			expect(event.locals.session).toBeNull();
			expect(event.locals.user).toBeNull();
			expect(event.cookies.getAll()).toEqual([
				{ name: 'sb-other-auth-token', value: 'unrelated' },
				{ name: 'theme', value: 'dark' }
			]);
		});

		it.each(['error', 'throw'])(
			'denies expired requests when revocation fails with %s and preserves retry cookies',
			async (failure) => {
				const h = await createAuthenticatedHookHarness(
					{ data: false, error: null },
					{ sessionStartedAt: '2026-09-15T12:00:00Z' }
				);
				if (failure === 'error') h.signOut.mockResolvedValueOnce({ error: { message: 'unavailable' } });
				else h.signOut.mockRejectedValueOnce(new Error('unavailable'));
				await expect(h.handle(h)).rejects.toMatchObject({ status: 503 });
				expect(h.resolve).not.toHaveBeenCalled();
				expect(h.event.cookies.get('sb-example-auth-token')).toBe('session');
				await expect(h.handle({ event: h.createEvent(), resolve: h.resolve })).rejects.toMatchObject({ status: 303 });
			}
		);
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
		expect(anonymous.locals.actor).toBeNull();
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
			const event = harness.createEvent(path);
			expect((await harness.handle({ event, resolve: harness.resolve })).status).toBe(200);
			expect(event.locals.actor).toBeNull();
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
		expect(harness.event.locals.actor).toEqual({ userId: 'user-1' });
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
		const event = harness.createEvent(path, {
			'sb-example-auth-token': 'session',
			ttt_pending_auth_flow: signedFlow(flow)
		});
		await expect(harness.handle({ event, resolve: harness.resolve })).rejects.toMatchObject({
			status: 303,
			location: destination
		});
		expect(harness.resolve).not.toHaveBeenCalled();
	});

	it('does not grant recovery authority from an unsigned cookie on a verified session', async () => {
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		const event = harness.createEvent('/dashboard', {
			'sb-example-auth-token': 'session',
			ttt_pending_auth_flow: 'recovery'
		});
		expect((await harness.handle({ event, resolve: harness.resolve })).status).toBe(200);
		expect(event.locals.authFlow).toBeNull();
		expect(event.locals.actor).toEqual({ userId: 'user-1' });
		expect(event.cookies.get('ttt_pending_auth_flow')).toBeUndefined();
		expect(harness.resolve).toHaveBeenCalled();
	});

	it('does not grant invite authority from a marker issued for a different session', async () => {
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		const event = harness.createEvent('/dashboard', {
			'sb-example-auth-token': 'session',
			ttt_pending_auth_flow: signedFlow('invite', '00000000-0000-4000-8000-000000000002')
		});
		expect((await harness.handle({ event, resolve: harness.resolve })).status).toBe(200);
		expect(event.locals.authFlow).toBeNull();
		expect(event.locals.actor).toEqual({ userId: 'user-1' });
		expect(event.cookies.get('ttt_pending_auth_flow')).toBeUndefined();
		expect(harness.resolve).toHaveBeenCalled();
	});

	it.each([
		{ label: 'missing', marker: undefined },
		{ label: 'forged', marker: 'recovery' },
		{ label: 'different session', marker: signedFlow('invite', '00000000-0000-4000-8000-000000000002') }
	])('discards an OTP session with a $label completion marker before application access', async ({ marker }) => {
		const harness = await createAuthenticatedHookHarness({ data: false, error: null }, { authMethod: 'otp' });
		const event = harness.createEvent('/dashboard', {
			'sb-example-auth-token': 'session',
			...(marker ? { ttt_pending_auth_flow: marker } : {})
		});
		await expect(harness.handle({ event, resolve: harness.resolve })).rejects.toMatchObject({
			status: 303,
			location: '/auth/login'
		});
		expect(event.locals.actor).toBeNull();
		expect(event.locals.session).toBeNull();
		expect(event.cookies.get('sb-example-auth-token')).toBeUndefined();
		expect(harness.resolve).not.toHaveBeenCalled();
	});

	it('admits a completed OTP session only while its signed session marker is present', async () => {
		const harness = await createAuthenticatedHookHarness({ data: false, error: null }, { authMethod: 'otp' });
		const event = harness.createEvent('/dashboard', {
			'sb-example-auth-token': 'session',
			ttt_pending_auth_flow: signedFlow('complete')
		});
		expect((await harness.handle({ event, resolve: harness.resolve })).status).toBe(200);
		expect(event.locals.authFlow).toBeNull();
		expect(event.locals.actor).toEqual({ userId: 'user-1' });
	});

	it('revokes an OTP provider session on logout after its completion marker is lost', async () => {
		const harness = await createAuthenticatedHookHarness({ data: false, error: null }, { authMethod: 'otp' });
		const event = harness.createEvent('/auth/logout', { 'sb-example-auth-token': 'session' });
		const { actions } = await import('./routes/auth/logout/+page.server');
		const resolve = vi.fn(async (requestEvent: Parameters<Handle>[0]['event']) => {
			await actions.default({ ...requestEvent, params: {}, route: { id: '/auth/logout' } });
			return new Response('unreachable');
		});
		await expect(harness.handle({ event, resolve })).rejects.toMatchObject({ status: 303, location: '/' });
		expect(event.locals.actor).toBeNull();
		expect(harness.signOut).toHaveBeenCalledWith(
			passwordSessionToken('user-1', 'admitted', '00000000-0000-4000-8000-000000000001', 'otp'),
			'global'
		);
		expect(event.cookies.get('sb-example-auth-token')).toBeUndefined();
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
		const event = harness.createEvent(path, {
			'sb-example-auth-token': 'session',
			ttt_pending_auth_flow: signedFlow(flow)
		});
		expect((await harness.handle({ event, resolve: harness.resolve })).status).toBe(200);
		expect(event.locals.actor).toBeNull();
		expect(harness.resolve).toHaveBeenCalled();
	});

	it.each(['recovery', 'invite'])('does not let a %s cookie bypass an assurance lookup failure', async (flow) => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		harness.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
		const event = harness.createEvent('/api/auth/update-password', {
			'sb-example-auth-token': 'session',
			ttt_pending_auth_flow: signedFlow(flow)
		});
		await expect(harness.handle({ event, resolve: harness.resolve })).rejects.toMatchObject({ status: 503 });
		expect(harness.resolve).not.toHaveBeenCalled();
	});

	it.each([null, 'recovery', 'invite'])('allows real logout during an assurance outage with flow %s', async (flow) => {
		const harness = await createAuthenticatedHookHarness({ data: true, error: null });
		harness.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('provider unavailable'));
		const event = harness.createEvent('/auth/logout', {
			'sb-example-auth-token': 'session',
			...(flow ? { ttt_pending_auth_flow: signedFlow(flow) } : {})
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

	it.each([null, 'recovery', 'invite'])(
		'keeps logout failure and retry reachable during an assurance outage with flow %s',
		async (flow) => {
			const harness = await createAuthenticatedHookHarness({ data: true, error: null });
			harness.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('provider unavailable'));
			harness.signOut.mockResolvedValueOnce({ error: { message: 'revocation unavailable' } });
			const event = harness.createEvent('/auth/logout', {
				'sb-example-auth-token': 'session',
				...(flow ? { ttt_pending_auth_flow: signedFlow(flow) } : {})
			});
			const { actions } = await import('./routes/auth/logout/+page.server');
			const resolve = async (event: Parameters<Handle>[0]['event']) => {
				const result = await actions.default({ ...event, params: {}, route: { id: '/auth/logout' } });
				return Response.json(result);
			};
			const failure = await harness.handle({ event, resolve });
			expect(await failure.json()).toMatchObject({ status: 503 });
			expect(event.cookies.get('ttt_pending_auth_flow')).toBe(flow ? signedFlow(flow) : undefined);
			await expect(harness.handle({ event, resolve })).rejects.toMatchObject({ status: 303, location: '/' });
			expect(event.cookies.get('ttt_pending_auth_flow')).toBeUndefined();
		}
	);

	it('preserves pending recovery on logout failure even when identity cannot be verified', async () => {
		const harness = await createAuthenticatedHookHarness({ data: false, error: null });
		harness.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'identity unavailable' } });
		harness.signOut.mockResolvedValueOnce({ error: { message: 'revocation unavailable' } });
		const event = harness.createEvent('/auth/logout', {
			'sb-example-auth-token': 'session',
			ttt_pending_auth_flow: signedFlow('recovery')
		});
		const { actions } = await import('./routes/auth/logout/+page.server');
		const resolve = async (event: Parameters<Handle>[0]['event']) => {
			const result = await actions.default({ ...event, params: {}, route: { id: '/auth/logout' } });
			return Response.json(result);
		};
		const failure = await harness.handle({ event, resolve });
		expect(await failure.json()).toMatchObject({ status: 503 });
		expect(event.locals.user).toBeNull();
		expect(event.cookies.get('ttt_pending_auth_flow')).toBe(signedFlow('recovery'));
		await expect(harness.handle({ event, resolve })).rejects.toMatchObject({ status: 303, location: '/' });
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
			const event = harness.createEvent(path);
			expect((await harness.handle({ event, resolve: harness.resolve })).status).toBe(200);
			expect(event.locals.actor).toBeNull();
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
		await expect(harness.handle(harness)).rejects.toMatchObject({
			status: 500,
			body: { message: 'Unable to verify account status' }
		});
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
		expect(locals.session?.access_token).toBe(passwordSessionToken('user-1'));
		expect(locals.session).not.toHaveProperty('provider_token');
		expect(locals.session).not.toHaveProperty('provider_refresh_token');
		expect(readStoredUserDuringMfa).toHaveReturnedWith(expect.stringContaining('"id":"user-1"'));
		expect(resolve).toHaveBeenCalled();
	});

	it('uses the provider-confirmed email for downstream requests while the admitted JWT still contains the old email', async () => {
		const h = await createAuthenticatedHookHarness({ data: false, error: null });
		const current = (await h.getUser()).data.user;
		h.getUser.mockResolvedValue({ data: { user: { ...current, email: 'confirmed@example.test' } }, error: null });
		h.resolve.mockImplementation(async (event) =>
			Response.json({ email: event.locals.user?.email, sessionEmail: event.locals.session?.user.email })
		);
		const response = await h.handle({ event: h.event, resolve: h.resolve });
		expect(await response.json()).toEqual({ email: 'confirmed@example.test', sessionEmail: 'confirmed@example.test' });
		expect(h.event.locals.session?.access_token).toBe(passwordSessionToken('user-1'));
		expect(h.deleteCookie).not.toHaveBeenCalled();
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

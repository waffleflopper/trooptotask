import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Handle } from '@sveltejs/kit';

describe('server auth hook', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	async function createAuthenticatedHookHarness(
		rpcResult: {
			data: boolean | null;
			error: { message: string } | null;
		},
		options: { authenticatedUserId?: string } = {}
	) {
		const now = new Date();
		const user = {
			id: 'user-1',
			aud: 'authenticated',
			email: 'user@example.com',
			app_metadata: {},
			user_metadata: {},
			created_at: now.toISOString(),
			last_sign_in_at: now.toISOString(),
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
		const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
			data: { currentLevel: 'aal1', nextLevel: 'aal1' },
			error: null
		});
		const rpc = vi.fn().mockResolvedValue(rpcResult);
		const createServerClient = vi.fn(() => ({
			auth: {
				getSession,
				getClaims,
				getUser,
				mfa: {
					getAuthenticatorAssuranceLevel
				}
			},
			rpc
		}));
		const resolve = vi.fn().mockResolvedValue(new Response('ok'));

		vi.doMock('@supabase/ssr', () => ({ createServerClient }));
		vi.doMock('$env/static/public', () => ({
			PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
			PUBLIC_SUPABASE_ANON_KEY: 'anon-key'
		}));
		vi.doMock('$lib/server/env', () => ({}));

		const { handle } = await import('./hooks.server');
		const deleteCookie = vi.fn();
		const event = {
			url: new URL('http://localhost/dashboard'),
			request: new Request('http://localhost/dashboard'),
			locals: {},
			getClientAddress: () => '127.0.0.1',
			cookies: {
				getAll: () => [{ name: 'sb-example-auth-token', value: 'session' }],
				get: vi.fn(),
				set: vi.fn(),
				delete: deleteCookie
			}
		} as never;

		return { handle: handle as Handle, event, resolve, rpc, getUser, deleteCookie };
	}

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
		const { handle, event, resolve, getUser } = await createAuthenticatedHookHarness({
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

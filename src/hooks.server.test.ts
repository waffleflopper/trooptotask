import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Handle } from '@sveltejs/kit';

describe('server auth hook', () => {
	beforeEach(() => {
		vi.resetModules();
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
});

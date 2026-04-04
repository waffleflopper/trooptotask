import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

describe('POST /api/auth/establish-session', () => {
	it('establishes a server-side session from access and refresh tokens', async () => {
		const setSession = vi.fn().mockResolvedValue({ error: null });
		const cookies = { set: vi.fn() };

		const response = await POST({
			request: new Request('http://localhost/api/auth/establish-session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					accessToken: 'access-token',
					refreshToken: 'refresh-token'
				})
			}),
			locals: {
				supabase: {
					auth: {
						setSession
					}
				}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(setSession).toHaveBeenCalledWith({
			access_token: 'access-token',
			refresh_token: 'refresh-token'
		});
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('stores the pending auth flow marker when a recovery or invite flow establishes the session', async () => {
		const setSession = vi.fn().mockResolvedValue({ error: null });
		const cookies = { set: vi.fn() };

		const response = await POST({
			request: new Request('http://localhost/api/auth/establish-session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					accessToken: 'access-token',
					refreshToken: 'refresh-token',
					flow: 'recovery'
				})
			}),
			locals: {
				supabase: {
					auth: {
						setSession
					}
				}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(cookies.set).toHaveBeenCalledWith(
			'ttt_pending_auth_flow',
			'recovery',
			expect.objectContaining({
				path: '/',
				httpOnly: true,
				sameSite: 'lax'
			})
		);
	});

	it('rejects requests when either token is missing', async () => {
		const setSession = vi.fn();

		const response = await POST({
			request: new Request('http://localhost/api/auth/establish-session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					accessToken: 'access-token'
				})
			}),
			locals: {
				supabase: {
					auth: {
						setSession
					}
				}
			},
			cookies: { set: vi.fn() }
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'Both accessToken and refreshToken are required.'
		});
		expect(setSession).not.toHaveBeenCalled();
	});

	it('fails closed when the session exchange is rejected', async () => {
		const setSession = vi.fn().mockResolvedValue({
			error: { message: 'Invalid refresh token' }
		});

		const response = await POST({
			request: new Request('http://localhost/api/auth/establish-session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					accessToken: 'access-token',
					refreshToken: 'refresh-token'
				})
			}),
			locals: {
				supabase: {
					auth: {
						setSession
					}
				}
			},
			cookies: { set: vi.fn() }
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Invalid refresh token'
		});
	});
});

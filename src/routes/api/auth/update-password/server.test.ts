import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

describe('POST /api/auth/update-password', () => {
	it('updates the current user password when the new password passes policy', async () => {
		const updateUser = vi.fn().mockResolvedValue({ error: null });
		const cookies = { delete: vi.fn() };

		const response = await POST({
			request: new Request('http://localhost/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'SecurePass12' })
			}),
			locals: {
				session: { user: { id: 'user-123' } },
				supabase: {
					auth: {
						updateUser
					}
				}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(updateUser).toHaveBeenCalledWith({ password: 'SecurePass12' });
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it('rejects passwords that do not meet policy', async () => {
		const updateUser = vi.fn();
		const cookies = { delete: vi.fn() };

		const response = await POST({
			request: new Request('http://localhost/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'short' })
			}),
			locals: {
				session: { user: { id: 'user-123' } },
				supabase: {
					auth: {
						updateUser
					}
				}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'Password must be at least 12 characters'
		});
		expect(updateUser).not.toHaveBeenCalled();
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it('returns an auth error when Supabase rejects the password update', async () => {
		const updateUser = vi.fn().mockResolvedValue({
			error: { message: 'Password update failed.' }
		});
		const cookies = { delete: vi.fn() };

		const response = await POST({
			request: new Request('http://localhost/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'SecurePass12' })
			}),
			locals: {
				session: { user: { id: 'user-123' } },
				supabase: {
					auth: {
						updateUser
					}
				}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Password update failed.'
		});
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it('updates the password for an active recovery session and clears the recovery flow marker', async () => {
		const updateUser = vi.fn().mockResolvedValue({ error: null });
		const cookies = { delete: vi.fn() };

		const response = await POST({
			request: new Request('http://localhost/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'SecurePass12' })
			}),
			locals: {
				session: { user: { id: 'user-123' } },
				authFlow: 'recovery',
				supabase: {
					auth: {
						updateUser
					}
				}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(updateUser).toHaveBeenCalledWith({ password: 'SecurePass12' });
		expect(cookies.delete).toHaveBeenCalledWith('ttt_pending_auth_flow', { path: '/' });
	});

	it('returns an auth error when the recovery or invite session is missing', async () => {
		const updateUser = vi.fn();
		const cookies = { delete: vi.fn() };

		const response = await POST({
			request: new Request('http://localhost/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'SecurePass12' })
			}),
			locals: {
				supabase: {
					auth: {
						updateUser
					}
				}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Your account recovery session is no longer active. Please reopen the link and try again.'
		});
		expect(updateUser).not.toHaveBeenCalled();
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it('does not clear the pending flow marker for invite sessions before invite finalization finishes', async () => {
		const updateUser = vi.fn().mockResolvedValue({ error: null });
		const cookies = { delete: vi.fn() };

		const response = await POST({
			request: new Request('http://localhost/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'SecurePass12' })
			}),
			locals: {
				session: { user: { id: 'user-123' } },
				authFlow: 'invite',
				supabase: {
					auth: {
						updateUser
					}
				}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(updateUser).toHaveBeenCalledWith({ password: 'SecurePass12' });
		expect(cookies.delete).not.toHaveBeenCalled();
	});
});

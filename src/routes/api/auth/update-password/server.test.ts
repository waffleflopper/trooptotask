import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

describe('POST /api/auth/update-password', () => {
	it('updates the current user password when the new password passes policy', async () => {
		const updateUser = vi.fn().mockResolvedValue({ error: null });

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
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(updateUser).toHaveBeenCalledWith({ password: 'SecurePass12' });
	});

	it('rejects passwords that do not meet policy', async () => {
		const updateUser = vi.fn();

		const response = await POST({
			request: new Request('http://localhost/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'short' })
			}),
			locals: {
				supabase: {
					auth: {
						updateUser
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'Password must be at least 12 characters'
		});
		expect(updateUser).not.toHaveBeenCalled();
	});

	it('returns an auth error when Supabase rejects the password update', async () => {
		const updateUser = vi.fn().mockResolvedValue({
			error: { message: 'Password update failed.' }
		});

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
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Password update failed.'
		});
	});
});

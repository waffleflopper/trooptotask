import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

describe('POST /api/auth/mfa/enroll/cancel', () => {
	it('cancels an in-progress enrollment by unenrolling the factor', async () => {
		const unenroll = vi.fn().mockResolvedValue({ error: null });

		const response = await POST({
			request: new Request('http://localhost/api/auth/mfa/enroll/cancel', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					factorId: 'factor-1'
				})
			}),
			locals: {
				supabase: {
					auth: {
						mfa: {
							unenroll
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(unenroll).toHaveBeenCalledWith({
			factorId: 'factor-1'
		});
	});

	it('rejects cancel requests when factorId is missing', async () => {
		const unenroll = vi.fn();

		const response = await POST({
			request: new Request('http://localhost/api/auth/mfa/enroll/cancel', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			}),
			locals: {
				supabase: {
					auth: {
						mfa: {
							unenroll
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'factorId is required.'
		});
		expect(unenroll).not.toHaveBeenCalled();
	});

	it('returns an auth error when canceling enrollment fails', async () => {
		const unenroll = vi.fn().mockResolvedValue({
			error: { message: 'Failed to cancel MFA enrollment.' }
		});

		const response = await POST({
			request: new Request('http://localhost/api/auth/mfa/enroll/cancel', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					factorId: 'factor-1'
				})
			}),
			locals: {
				supabase: {
					auth: {
						mfa: {
							unenroll
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Failed to cancel MFA enrollment.'
		});
	});
});

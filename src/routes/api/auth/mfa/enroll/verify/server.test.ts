import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

describe('POST /api/auth/mfa/enroll/verify', () => {
	it('verifies an enrollment challenge for the provided factor', async () => {
		const challengeAndVerify = vi.fn().mockResolvedValue({ error: null });

		const response = await POST({
			request: new Request('http://localhost/api/auth/mfa/enroll/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					factorId: 'factor-1',
					code: '123456'
				})
			}),
			locals: {
				supabase: {
					auth: {
						mfa: {
							challengeAndVerify
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(challengeAndVerify).toHaveBeenCalledWith({
			factorId: 'factor-1',
			code: '123456'
		});
	});

	it('rejects requests when factorId or code is missing', async () => {
		const challengeAndVerify = vi.fn();

		const response = await POST({
			request: new Request('http://localhost/api/auth/mfa/enroll/verify', {
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
							challengeAndVerify
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'Both factorId and code are required.'
		});
		expect(challengeAndVerify).not.toHaveBeenCalled();
	});

	it('returns an auth error when the enrollment code is invalid', async () => {
		const challengeAndVerify = vi.fn().mockResolvedValue({
			error: { message: 'Invalid enrollment code.' }
		});

		const response = await POST({
			request: new Request('http://localhost/api/auth/mfa/enroll/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					factorId: 'factor-1',
					code: '000000'
				})
			}),
			locals: {
				supabase: {
					auth: {
						mfa: {
							challengeAndVerify
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Invalid enrollment code.'
		});
	});
});

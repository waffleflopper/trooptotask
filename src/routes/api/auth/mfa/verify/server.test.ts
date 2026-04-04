import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

describe('POST /api/auth/mfa/verify', () => {
	it('verifies the code against the current verified TOTP factor', async () => {
		const listFactors = vi.fn().mockResolvedValue({
			data: {
				totp: [
					{ id: 'factor-unverified', status: 'unverified' },
					{ id: 'factor-verified', status: 'verified' }
				]
			}
		});
		const challengeAndVerify = vi.fn().mockResolvedValue({ error: null });

		const response = await POST({
			request: new Request('http://localhost/api/auth/mfa/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: '123456' })
			}),
			locals: {
				supabase: {
					auth: {
						mfa: {
							listFactors,
							challengeAndVerify
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(challengeAndVerify).toHaveBeenCalledWith({
			factorId: 'factor-verified',
			code: '123456'
		});
	});

	it('rejects verification when the code is missing or malformed', async () => {
		const listFactors = vi.fn();
		const challengeAndVerify = vi.fn();

		const response = await POST({
			request: new Request('http://localhost/api/auth/mfa/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: '12ab' })
			}),
			locals: {
				supabase: {
					auth: {
						mfa: {
							listFactors,
							challengeAndVerify
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'Enter the 6-digit code from your authenticator app.'
		});
		expect(listFactors).not.toHaveBeenCalled();
		expect(challengeAndVerify).not.toHaveBeenCalled();
	});

	it('rejects verification when no verified MFA factor exists', async () => {
		const listFactors = vi.fn().mockResolvedValue({
			data: {
				totp: [{ id: 'factor-unverified', status: 'unverified' }]
			}
		});
		const challengeAndVerify = vi.fn();

		const response = await POST({
			request: new Request('http://localhost/api/auth/mfa/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: '123456' })
			}),
			locals: {
				supabase: {
					auth: {
						mfa: {
							listFactors,
							challengeAndVerify
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'No verified MFA factor found.'
		});
		expect(challengeAndVerify).not.toHaveBeenCalled();
	});

	it('returns an auth failure when the MFA code is invalid', async () => {
		const listFactors = vi.fn().mockResolvedValue({
			data: {
				totp: [{ id: 'factor-verified', status: 'verified' }]
			}
		});
		const challengeAndVerify = vi.fn().mockResolvedValue({
			error: { message: 'Invalid authentication code.' }
		});

		const response = await POST({
			request: new Request('http://localhost/api/auth/mfa/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: '000000' })
			}),
			locals: {
				supabase: {
					auth: {
						mfa: {
							listFactors,
							challengeAndVerify
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Invalid authentication code.'
		});
	});
});

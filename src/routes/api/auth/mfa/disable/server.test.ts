import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

describe('POST /api/auth/mfa/disable', () => {
	it('disables the currently verified TOTP factor after a fresh TOTP challenge', async () => {
		const listFactors = vi.fn().mockResolvedValue({
			data: {
				totp: [
					{ id: 'factor-unverified', status: 'unverified' },
					{ id: 'factor-verified', status: 'verified' }
				]
			}
		});
		const challengeAndVerify = vi.fn().mockResolvedValue({ error: null });
		const unenroll = vi.fn().mockResolvedValue({ error: null });

		const response = await POST({
			request: new Request('http://localhost/api/auth/mfa/disable', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: '123456' })
			}),
			locals: {
				supabase: {
					auth: {
						mfa: {
							listFactors,
							challengeAndVerify,
							unenroll
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
		expect(unenroll).toHaveBeenCalledWith({
			factorId: 'factor-verified'
		});
	});

	it('rejects disable requests when the confirmation code is missing or malformed', async () => {
		const listFactors = vi.fn();
		const challengeAndVerify = vi.fn();
		const unenroll = vi.fn();

		const response = await POST({
			request: new Request('http://localhost/api/auth/mfa/disable', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: '12ab' })
			}),
			locals: {
				supabase: {
					auth: {
						mfa: {
							listFactors,
							challengeAndVerify,
							unenroll
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
		expect(unenroll).not.toHaveBeenCalled();
	});

	it('rejects disable requests when no verified factor exists', async () => {
		const listFactors = vi.fn().mockResolvedValue({
			data: {
				totp: [{ id: 'factor-unverified', status: 'unverified' }]
			}
		});
		const challengeAndVerify = vi.fn();
		const unenroll = vi.fn();

		const response = await POST({
			request: new Request('http://localhost/api/auth/mfa/disable', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: '123456' })
			}),
			locals: {
				supabase: {
					auth: {
						mfa: {
							listFactors,
							challengeAndVerify,
							unenroll
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
		expect(unenroll).not.toHaveBeenCalled();
	});

	it('returns an auth error when the fresh MFA challenge fails', async () => {
		const listFactors = vi.fn().mockResolvedValue({
			data: {
				totp: [{ id: 'factor-verified', status: 'verified' }]
			}
		});
		const challengeAndVerify = vi.fn().mockResolvedValue({
			error: { message: 'Invalid authenticator code.' }
		});
		const unenroll = vi.fn();

		const response = await POST({
			request: new Request('http://localhost/api/auth/mfa/disable', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: '123456' })
			}),
			locals: {
				supabase: {
					auth: {
						mfa: {
							listFactors,
							challengeAndVerify,
							unenroll
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Invalid authenticator code.'
		});
		expect(unenroll).not.toHaveBeenCalled();
	});

	it('returns an auth error when disabling MFA fails after a successful challenge', async () => {
		const listFactors = vi.fn().mockResolvedValue({
			data: {
				totp: [{ id: 'factor-verified', status: 'verified' }]
			}
		});
		const challengeAndVerify = vi.fn().mockResolvedValue({ error: null });
		const unenroll = vi.fn().mockResolvedValue({
			error: { message: 'Failed to disable MFA.' }
		});

		const response = await POST({
			request: new Request('http://localhost/api/auth/mfa/disable', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: '123456' })
			}),
			locals: {
				supabase: {
					auth: {
						mfa: {
							listFactors,
							challengeAndVerify,
							unenroll
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Failed to disable MFA.'
		});
	});
});

import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

describe('POST /api/auth/mfa/disable', () => {
	it('disables the currently verified TOTP factor', async () => {
		const listFactors = vi.fn().mockResolvedValue({
			data: {
				totp: [
					{ id: 'factor-unverified', status: 'unverified' },
					{ id: 'factor-verified', status: 'verified' }
				]
			}
		});
		const unenroll = vi.fn().mockResolvedValue({ error: null });

		const response = await POST({
			locals: {
				supabase: {
					auth: {
						mfa: {
							listFactors,
							unenroll
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(unenroll).toHaveBeenCalledWith({
			factorId: 'factor-verified'
		});
	});

	it('rejects disable requests when no verified factor exists', async () => {
		const listFactors = vi.fn().mockResolvedValue({
			data: {
				totp: [{ id: 'factor-unverified', status: 'unverified' }]
			}
		});
		const unenroll = vi.fn();

		const response = await POST({
			locals: {
				supabase: {
					auth: {
						mfa: {
							listFactors,
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
		expect(unenroll).not.toHaveBeenCalled();
	});

	it('returns an auth error when disabling MFA fails', async () => {
		const listFactors = vi.fn().mockResolvedValue({
			data: {
				totp: [{ id: 'factor-verified', status: 'verified' }]
			}
		});
		const unenroll = vi.fn().mockResolvedValue({
			error: { message: 'Failed to disable MFA.' }
		});

		const response = await POST({
			locals: {
				supabase: {
					auth: {
						mfa: {
							listFactors,
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

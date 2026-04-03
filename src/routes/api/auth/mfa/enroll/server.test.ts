import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

describe('POST /api/auth/mfa/enroll', () => {
	it('starts TOTP enrollment and returns the factor id and QR code', async () => {
		const enroll = vi.fn().mockResolvedValue({
			data: {
				id: 'factor-1',
				totp: {
					qr_code: 'data:image/png;base64,abc123'
				}
			},
			error: null
		});

		const response = await POST({
			locals: {
				supabase: {
					auth: {
						mfa: {
							enroll
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			factorId: 'factor-1',
			qrCode: 'data:image/png;base64,abc123'
		});
		expect(enroll).toHaveBeenCalledWith({
			factorType: 'totp'
		});
	});

	it('returns an auth error when enrollment cannot be started', async () => {
		const enroll = vi.fn().mockResolvedValue({
			data: null,
			error: { message: 'MFA enrollment is not available.' }
		});

		const response = await POST({
			locals: {
				supabase: {
					auth: {
						mfa: {
							enroll
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'MFA enrollment is not available.'
		});
	});
});

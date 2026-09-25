import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

describe('POST /api/auth/mfa/enroll', () => {
	it('starts TOTP enrollment and returns the factor id and QR code', async () => {
		const enroll = vi.fn().mockResolvedValue({
			data: {
				id: 'factor-1',
				type: 'totp',
				totp: {
					qr_code: 'data:image/png;base64,abc123'
				}
			},
			error: null
		});

		const response = await POST({
			locals: {
				actor: { userId: 'synthetic-user' },
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
			error: { message: 'MFA enrollment is not available. refresh_token=private-management-secret' }
		});

		const response = await POST({
			locals: {
				actor: { userId: 'synthetic-user' },
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
		const body = await response.json();
		expect(body).toEqual({ error: expect.any(String) });
		expect(JSON.stringify(body)).not.toContain('private-management-secret');
	});
});

describe('enrollment provider boundary', () => {
	async function invoke(enroll: ReturnType<typeof vi.fn>) {
		return POST({
			request: new Request('http://localhost/api/auth/mfa/enroll', {
				method: 'POST',
				body: JSON.stringify({ factorType: 'phone', userId: 'other-account' })
			}),
			locals: { actor: { userId: 'synthetic-user' }, supabase: { auth: { mfa: { enroll } } } }
		} as unknown as Parameters<typeof POST>[0]);
	}

	it('keeps factor type and account selection server-owned', async () => {
		const enroll = vi.fn().mockResolvedValue({
			data: { id: 'pending', type: 'totp', totp: { qr_code: 'synthetic-qr', secret: 'private-secret' } },
			error: null
		});
		const response = await invoke(enroll);
		expect(response.status).toBe(200);
		expect(enroll).toHaveBeenCalledWith({ factorType: 'totp' });
		expect(await response.json()).toEqual({ factorId: 'pending', qrCode: 'synthetic-qr' });
	});

	it.each([
		null,
		{},
		{ id: '', type: 'totp', totp: { qr_code: 'qr' } },
		{ id: 42, type: 'totp', totp: { qr_code: 'qr' } },
		{ id: 'pending', type: 'phone', totp: { qr_code: 'qr' } },
		{ id: 'pending', type: 'totp' },
		{ id: 'pending', type: 'totp', totp: { qr_code: '' } },
		{ id: 'pending', type: 'totp', totp: { qr_code: 42 } }
	])('does not expose unusable enrollment data: %j', async (data) => {
		const response = await invoke(vi.fn().mockResolvedValue({ data, error: null }));
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: expect.any(String) });
	});

	it('honors provider rejection even when data is present', async () => {
		const response = await invoke(
			vi.fn().mockResolvedValue({
				data: { id: 'pending', type: 'totp', totp: { qr_code: 'private-qr' } },
				error: { message: 'Enrollment rejected refresh_token=private-management-secret' }
			})
		);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body).toEqual({ error: expect.any(String) });
		expect(JSON.stringify(body)).not.toContain('private-management-secret');
	});

	it('returns a retryable error after a thrown provider failure', async () => {
		const response = await invoke(vi.fn().mockRejectedValue(new Error('provider details')));
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: expect.not.stringContaining('provider details') });
	});
});

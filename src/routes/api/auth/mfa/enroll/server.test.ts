import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

const totp = { qr_code: 'data:image/png;base64,abc123', secret: 'JBSWY3DPEHPK3PXP' };

function invoke(
	enroll: ReturnType<typeof vi.fn>,
	{
		factors = [] as { id: string; factor_type: string; status: string }[],
		listFactors = vi.fn().mockResolvedValue({ data: { all: factors, totp: [], phone: [] }, error: null }),
		unenroll = vi.fn().mockResolvedValue({ data: {}, error: null })
	} = {}
) {
	const request = POST({
		request: new Request('http://localhost/api/auth/mfa/enroll', {
			method: 'POST',
			body: JSON.stringify({ factorType: 'phone', userId: 'other-account' })
		}),
		locals: { actor: { userId: 'synthetic-user' }, supabase: { auth: { mfa: { enroll, listFactors, unenroll } } } }
	} as unknown as Parameters<typeof POST>[0]);
	return { request, listFactors, unenroll };
}

describe('POST /api/auth/mfa/enroll', () => {
	it('starts TOTP enrollment and returns the factor id, QR code and setup key', async () => {
		const enroll = vi.fn().mockResolvedValue({ data: { id: 'factor-1', type: 'totp', totp }, error: null });
		const response = await invoke(enroll).request;

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			factorId: 'factor-1',
			qrCode: 'data:image/png;base64,abc123',
			secret: 'JBSWY3DPEHPK3PXP'
		});
		expect(enroll).toHaveBeenCalledWith({ factorType: 'totp' });
	});

	it('refuses a second authenticator when MFA is already on', async () => {
		const enroll = vi.fn();
		const response = await invoke(enroll, {
			factors: [{ id: 'verified-factor', factor_type: 'totp', status: 'verified' }]
		}).request;

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: 'MFA is already on for this account.' });
		expect(enroll).not.toHaveBeenCalled();
	});

	it('replaces a setup that was left unfinished, so reloading the page starts cleanly', async () => {
		const enroll = vi.fn().mockResolvedValue({ data: { id: 'factor-2', type: 'totp', totp }, error: null });
		const { request, unenroll } = invoke(enroll, {
			factors: [{ id: 'abandoned', factor_type: 'totp', status: 'unverified' }]
		});
		const response = await request;

		expect(unenroll).toHaveBeenCalledWith({ factorId: 'abandoned' });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ factorId: 'factor-2' });
	});

	it.each([
		['the factor lookup fails', { listFactors: vi.fn().mockResolvedValue({ data: null, error: { message: 'down' } }) }],
		[
			'the abandoned factor cannot be removed',
			{
				factors: [{ id: 'abandoned', factor_type: 'totp', status: 'unverified' }],
				unenroll: vi.fn().mockResolvedValue({ data: null, error: { message: 'down' } })
			}
		]
	])('returns a retryable error when %s', async (_name, options) => {
		const enroll = vi.fn();
		const response = await invoke(enroll, options).request;
		expect(response.status).toBe(503);
		expect(enroll).not.toHaveBeenCalled();
	});

	it('returns an auth error when enrollment cannot be started', async () => {
		const enroll = vi.fn().mockResolvedValue({
			data: null,
			error: { message: 'MFA enrollment is not available. refresh_token=private-management-secret' }
		});
		const response = await invoke(enroll).request;

		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body).toEqual({ error: expect.any(String) });
		expect(JSON.stringify(body)).not.toContain('private-management-secret');
	});
});

describe('enrollment provider boundary', () => {
	it('keeps factor type and account selection server-owned', async () => {
		const enroll = vi.fn().mockResolvedValue({
			data: { id: 'pending', type: 'totp', totp: { qr_code: 'synthetic-qr', secret: 'synthetic-key' } },
			error: null
		});
		const response = await invoke(enroll).request;
		expect(response.status).toBe(200);
		expect(enroll).toHaveBeenCalledWith({ factorType: 'totp' });
		expect(await response.json()).toEqual({ factorId: 'pending', qrCode: 'synthetic-qr', secret: 'synthetic-key' });
	});

	it.each([
		null,
		{},
		{ id: '', type: 'totp', totp },
		{ id: 42, type: 'totp', totp },
		{ id: 'pending', type: 'phone', totp },
		{ id: 'pending', type: 'totp' },
		{ id: 'pending', type: 'totp', totp: { ...totp, qr_code: '' } },
		{ id: 'pending', type: 'totp', totp: { ...totp, qr_code: 42 } },
		{ id: 'pending', type: 'totp', totp: { qr_code: 'qr' } },
		{ id: 'pending', type: 'totp', totp: { qr_code: 'qr', secret: ' ' } }
	])('does not expose unusable enrollment data: %j', async (data) => {
		const response = await invoke(vi.fn().mockResolvedValue({ data, error: null })).request;
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: expect.any(String) });
	});

	it('honors provider rejection even when data is present', async () => {
		const response = await invoke(
			vi.fn().mockResolvedValue({
				data: { id: 'pending', type: 'totp', totp },
				error: { message: 'Enrollment rejected refresh_token=private-management-secret' }
			})
		).request;
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body).toEqual({ error: expect.any(String) });
		expect(JSON.stringify(body)).not.toContain('private-management-secret');
	});

	it('returns a retryable error after a thrown provider failure', async () => {
		const response = await invoke(vi.fn().mockRejectedValue(new Error('provider details'))).request;
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: expect.not.stringContaining('provider details') });
	});
});

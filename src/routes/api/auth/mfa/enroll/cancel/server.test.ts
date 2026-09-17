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
							listFactors: vi.fn().mockResolvedValue({
								data: { all: [{ id: 'factor-1', factor_type: 'totp', status: 'unverified' }] },
								error: null
							}),
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
							listFactors: vi.fn().mockResolvedValue({
								data: { all: [{ id: 'factor-1', factor_type: 'totp', status: 'unverified' }] },
								error: null
							}),
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
							listFactors: vi.fn().mockResolvedValue({
								data: { all: [{ id: 'factor-1', factor_type: 'totp', status: 'unverified' }] },
								error: null
							}),
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

describe('pending factor cancellation boundary', () => {
	function fixture() {
		const factors = [
			{ id: 'pending-factor', factor_type: 'totp', status: 'unverified' },
			{ id: 'verified-factor', factor_type: 'totp', status: 'verified' },
			{ id: 'phone-factor', factor_type: 'phone', status: 'unverified' }
		];
		const listFactors = vi.fn(async () => ({
			data: { all: [...factors], totp: factors.filter((f) => f.factor_type === 'totp' && f.status === 'verified') },
			error: null as { message: string } | null
		}));
		const unenroll = vi.fn(async ({ factorId }: { factorId: string }) => {
			const index = factors.findIndex((f) => f.id === factorId);
			if (index !== -1) factors.splice(index, 1);
			return { error: null as { message: string } | null };
		});
		const request = (body: string) =>
			POST({
				request: new Request('http://localhost/api/auth/mfa/enroll/cancel', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body
				}),
				locals: { supabase: { auth: { mfa: { listFactors, unenroll } } } }
			} as unknown as Parameters<typeof POST>[0]);
		return {
			factors,
			listFactors,
			unenroll,
			request,
			cancel: (factorId: unknown) => request(JSON.stringify({ factorId }))
		};
	}

	it.each(['verified-factor', 'phone-factor', 'unknown-factor', 'foreign-factor'])(
		'rejects %s without changing any factor',
		async (factorId) => {
			const f = fixture();
			const before = [...f.factors];
			const response = await f.cancel(factorId);
			expect(response.status).toBe(400);
			expect(await response.json()).toHaveProperty('error');
			expect(f.unenroll).not.toHaveBeenCalled();
			expect(f.factors).toEqual(before);
		}
	);

	it.each(['{', 'null', '[]', '"pending-factor"', '{}', '{"factorId":42}', '{"factorId":{}}', '{"factorId":"   "}'])(
		'rejects malformed input %s before provider access',
		async (body) => {
			const f = fixture();
			const response = await f.request(body);
			expect(response.status).toBe(400);
			expect(await response.json()).toHaveProperty('error');
			expect(f.listFactors).not.toHaveBeenCalled();
			expect(f.unenroll).not.toHaveBeenCalled();
		}
	);

	it('removes only the pending TOTP factor and rejects replay', async () => {
		const f = fixture();
		expect((await f.cancel('pending-factor')).status).toBe(200);
		expect(f.factors.map((factor) => factor.id)).toEqual(['verified-factor', 'phone-factor']);
		expect((await f.cancel('pending-factor')).status).toBe(400);
		expect(f.unenroll).toHaveBeenCalledTimes(1);
	});

	it.each(['error with data', 'missing data', 'exception'])(
		'preserves pending enrollment on lookup %s',
		async (failure) => {
			const f = fixture();
			const before = [...f.factors];
			if (failure === 'exception') f.listFactors.mockRejectedValueOnce(new Error('Provider unavailable'));
			else if (failure === 'missing data') f.listFactors.mockResolvedValueOnce({ data: null, error: null } as never);
			else
				f.listFactors.mockResolvedValueOnce({
					data: { all: [...f.factors], totp: [] },
					error: { message: 'Provider unavailable' }
				});
			expect((await f.cancel('pending-factor')).status).toBe(503);
			expect(f.unenroll).not.toHaveBeenCalled();
			expect(f.factors).toEqual(before);
			expect((await f.cancel('pending-factor')).status).toBe(200);
		}
	);

	it.each(['rejection', 'exception'])('preserves the factor on unenrollment %s and permits retry', async (failure) => {
		const f = fixture();
		if (failure === 'exception') f.unenroll.mockRejectedValueOnce(new Error('Provider unavailable'));
		else f.unenroll.mockResolvedValueOnce({ error: { message: 'Removal failed' } });
		expect((await f.cancel('pending-factor')).status).toBe(failure === 'exception' ? 503 : 401);
		expect(f.factors.some((factor) => factor.id === 'pending-factor')).toBe(true);
		expect((await f.cancel('pending-factor')).status).toBe(200);
		expect(f.factors.some((factor) => factor.id === 'pending-factor')).toBe(false);
	});
});

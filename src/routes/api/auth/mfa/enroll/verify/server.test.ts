import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

describe('POST /api/auth/mfa/enroll/verify', () => {
	it('verifies an enrollment challenge for the provided factor', async () => {
		const challengeAndVerify = vi.fn().mockResolvedValue({
			data: { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' },
			error: null
		});

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
				actor: { userId: 'synthetic-user' },
				supabase: {
					auth: {
						mfa: {
							listFactors: vi.fn().mockResolvedValue({
								data: { all: [{ id: 'factor-1', factor_type: 'totp', status: 'unverified' }] },
								error: null
							}),
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
				actor: { userId: 'synthetic-user' },
				supabase: {
					auth: {
						mfa: {
							listFactors: vi.fn().mockResolvedValue({
								data: { all: [{ id: 'factor-1', factor_type: 'totp', status: 'unverified' }] },
								error: null
							}),
							challengeAndVerify
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'A factorId and a 6-digit code are required.'
		});
		expect(challengeAndVerify).not.toHaveBeenCalled();
	});

	it('returns an auth error when the enrollment code is invalid', async () => {
		const challengeAndVerify = vi.fn().mockResolvedValue({
			error: { message: 'Invalid enrollment code. refresh_token=private-management-secret' }
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
				actor: { userId: 'synthetic-user' },
				supabase: {
					auth: {
						mfa: {
							listFactors: vi.fn().mockResolvedValue({
								data: { all: [{ id: 'factor-1', factor_type: 'totp', status: 'unverified' }] },
								error: null
							}),
							challengeAndVerify
						}
					}
				}
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(401);
		const body = await response.json();
		expect(body).toEqual({ error: expect.any(String) });
		expect(JSON.stringify(body)).not.toContain('private-management-secret');
	});
});

describe('pending enrollment confirmation boundary', () => {
	function setup() {
		const factors = [
			{ id: 'pending', factor_type: 'totp', status: 'unverified' },
			{ id: 'existing', factor_type: 'totp', status: 'verified' },
			{ id: 'phone', factor_type: 'phone', status: 'unverified' }
		];
		const listFactors = vi.fn().mockImplementation(async () => ({ data: { all: factors }, error: null }));
		const challengeAndVerify = vi.fn().mockImplementation(async ({ factorId, code }) => {
			if (code !== '123456') return { data: null, error: { message: 'Invalid or expired code' } };
			const factor = factors.find((item) => item.id === factorId);
			if (factor) factor.status = 'verified';
			return { data: { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' }, error: null };
		});
		const unenroll = vi.fn();
		const invoke = (body: unknown = { factorId: 'pending', code: '123456' }, raw = false) =>
			POST({
				request: new Request('http://localhost/api/auth/mfa/enroll/verify', {
					method: 'POST',
					body: raw ? (body as string) : JSON.stringify(body)
				}),
				locals: {
					actor: { userId: 'synthetic-user' },
					supabase: { auth: { mfa: { listFactors, challengeAndVerify, unenroll } } }
				}
			} as unknown as Parameters<typeof POST>[0]);
		return { factors, listFactors, challengeAndVerify, unenroll, invoke };
	}

	it('confirms only the pending factor and rejects replay without another challenge', async () => {
		const h = setup();
		expect(await (await h.invoke()).json()).toEqual({ ok: true });
		expect(h.factors).toEqual([
			{ id: 'pending', factor_type: 'totp', status: 'verified' },
			{ id: 'existing', factor_type: 'totp', status: 'verified' },
			{ id: 'phone', factor_type: 'phone', status: 'unverified' }
		]);
		expect((await h.invoke()).status).toBe(400);
		expect(h.challengeAndVerify).toHaveBeenCalledTimes(1);
		expect(h.unenroll).not.toHaveBeenCalled();
	});

	it.each(['existing', 'phone', 'foreign-factor', 'unknown-factor'])(
		'denies %s before challenging',
		async (factorId) => {
			const h = setup();
			const before = structuredClone(h.factors);
			expect((await h.invoke({ factorId, code: '123456' })).status).toBe(400);
			expect(h.challengeAndVerify).not.toHaveBeenCalled();
			expect(h.unenroll).not.toHaveBeenCalled();
			expect(h.factors).toEqual(before);
		}
	);

	it.each([
		null,
		[],
		{},
		{ factorId: 1, code: '123456' },
		{ factorId: ' ', code: '123456' },
		{ factorId: 'pending', code: 123456 },
		{ factorId: 'pending', code: 'abcdef' },
		{ factorId: 'pending', code: '12345' },
		{ factorId: 'pending', code: '1234567' }
	])('rejects malformed input %j without provider effects', async (body) => {
		const h = setup();
		expect((await h.invoke(body)).status).toBe(400);
		expect(h.listFactors).not.toHaveBeenCalled();
		expect(h.challengeAndVerify).not.toHaveBeenCalled();
	});

	it('rejects malformed JSON without a server exception', async () => {
		const h = setup();
		expect((await h.invoke('{', true)).status).toBe(400);
		expect(h.challengeAndVerify).not.toHaveBeenCalled();
	});

	it.each(['data plus error', 'missing data', 'exception'])(
		'retains pending enrollment after lookup %s',
		async (failure) => {
			const h = setup();
			if (failure === 'exception') h.listFactors.mockRejectedValueOnce(new Error('offline'));
			else
				h.listFactors.mockResolvedValueOnce({
					data: failure === 'missing data' ? null : { all: h.factors },
					error: failure === 'data plus error' ? { message: 'unavailable' } : null
				});
			expect((await h.invoke()).status).toBe(503);
			expect(h.challengeAndVerify).not.toHaveBeenCalled();
			expect(h.unenroll).not.toHaveBeenCalled();
			expect(h.factors[0].status).toBe('unverified');
			expect((await h.invoke()).status).toBe(200);
		}
	);

	it('preserves pending enrollment after an invalid/expired code and allows retry', async () => {
		const h = setup();
		expect((await h.invoke({ factorId: 'pending', code: '000000' })).status).toBe(401);
		expect(h.factors[0].status).toBe('unverified');
		expect(h.unenroll).not.toHaveBeenCalled();
		expect((await h.invoke()).status).toBe(200);
		expect(h.factors[0].status).toBe('verified');
	});

	it.each(['data plus error', 'missing data', 'missing tokens', 'exception'])(
		'never reports success after verification %s',
		async (failure) => {
			const h = setup();
			if (failure === 'exception') h.challengeAndVerify.mockRejectedValueOnce(new Error('offline'));
			else
				h.challengeAndVerify.mockResolvedValueOnce({
					data:
						failure === 'missing data'
							? null
							: failure === 'missing tokens'
								? {}
								: { access_token: 'access', refresh_token: 'refresh' },
					error: failure === 'data plus error' ? { message: 'Rejected' } : null
				});
			const response = await h.invoke();
			expect(response.status).toBe(failure === 'data plus error' ? 401 : 503);
			expect(await response.json()).toEqual({ error: expect.any(String) });
			expect(h.factors[0].status).toBe('unverified');
			expect(h.unenroll).not.toHaveBeenCalled();
			expect((await h.invoke()).status).toBe(200);
		}
	);
});

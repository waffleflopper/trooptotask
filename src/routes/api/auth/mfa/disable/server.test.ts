import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

describe('POST /api/auth/mfa/disable', () => {
	it('disables the currently verified TOTP factor after a fresh TOTP challenge', async () => {
		const listFactors = vi.fn().mockResolvedValue({
			data: {
				all: [
					{ id: 'factor-unverified', factor_type: 'totp', status: 'unverified' },
					{ id: 'factor-verified', factor_type: 'totp', status: 'verified' }
				]
			}
		});
		const challengeAndVerify = vi.fn().mockResolvedValue({
			data: { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' },
			error: null
		});
		const unenroll = vi.fn().mockResolvedValue({ data: { id: 'factor-verified' }, error: null });

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
				all: [{ id: 'factor-unverified', factor_type: 'totp', status: 'unverified' }]
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
				all: [{ id: 'factor-verified', factor_type: 'totp', status: 'verified' }]
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
				all: [{ id: 'factor-verified', factor_type: 'totp', status: 'verified' }]
			}
		});
		const challengeAndVerify = vi.fn().mockResolvedValue({
			data: { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' },
			error: null
		});
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

describe('fresh-challenge disable boundary', () => {
	function harness() {
		const factors = [
			{ id: 'pending-sibling', factor_type: 'totp', status: 'unverified' },
			{ id: 'owned-totp', factor_type: 'totp', status: 'verified' },
			{ id: 'phone-sibling', factor_type: 'phone', status: 'verified' }
		];
		const challenge = { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' };
		const mfa = {
			listFactors: vi.fn(async () => ({
				data: { all: [...factors], totp: factors.filter((factor) => factor.factor_type === 'totp') },
				error: null
			})),
			challengeAndVerify: vi.fn(async (_input: { factorId: string; code: string }) => ({
				data: challenge,
				error: null
			})),
			unenroll: vi.fn(async ({ factorId }: { factorId: string }) => {
				factors.splice(
					factors.findIndex((factor) => factor.id === factorId),
					1
				);
				return { data: { id: factorId }, error: null };
			})
		};
		const request = (body = JSON.stringify({ code: '123456' })) =>
			POST({
				request: new Request('http://localhost/api/auth/mfa/disable', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body
				}),
				locals: { supabase: { auth: { mfa } } }
			} as unknown as Parameters<typeof POST>[0]);
		return { factors, challenge, mfa, request };
	}

	it.each([
		'{',
		'null',
		'[]',
		'{}',
		'{"code":123456}',
		'{"code":["123456"]}',
		'{"code":"12345"}',
		'{"code":"1234567"}'
	])('rejects malformed input %s before provider access', async (body) => {
		const h = harness();
		expect((await h.request(body)).status).toBe(400);
		expect(h.mfa.listFactors).not.toHaveBeenCalled();
		expect(h.mfa.unenroll).not.toHaveBeenCalled();
	});

	it('selects only the authenticated verified TOTP, preserves siblings, and rejects deletion replay', async () => {
		const h = harness();
		const response = await h.request(
			JSON.stringify({ code: '123456', factorId: 'foreign-factor', userId: 'other-user' })
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(h.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'owned-totp', code: '123456' });
		expect(h.factors.map((factor) => factor.id)).toEqual(['pending-sibling', 'phone-sibling']);
		expect((await h.request()).status).toBe(400);
		expect(h.mfa.unenroll).toHaveBeenCalledTimes(1);
		expect(h.mfa.challengeAndVerify).toHaveBeenCalledTimes(1);
	});

	it.each([
		{ data: null, error: null },
		{
			data: {
				all: [{ id: 'owned-totp', factor_type: 'totp', status: 'verified' }],
				totp: [{ id: 'owned-totp', status: 'verified' }]
			},
			error: { message: 'Lookup unavailable' }
		}
	])('denies failed factor lookup even when usable data accompanies it', async (result) => {
		const h = harness();
		h.mfa.listFactors.mockResolvedValueOnce(result as never);
		expect((await h.request()).status).toBe(503);
		expect(h.mfa.challengeAndVerify).not.toHaveBeenCalled();
		expect(h.mfa.unenroll).not.toHaveBeenCalled();
		expect(h.factors.map((factor) => factor.id)).toContain('owned-totp');
	});

	it.each(['invalid', 'expired', 'replayed'])('cannot delete after a provider-rejected %s code', async (reason) => {
		const h = harness();
		h.mfa.challengeAndVerify.mockResolvedValueOnce({ data: h.challenge, error: { message: reason } } as never);
		const response = await h.request();
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: reason });
		expect(h.mfa.unenroll).not.toHaveBeenCalled();
		expect(h.factors.map((factor) => factor.id)).toContain('owned-totp');
	});

	it.each([null, {}, { access_token: '', refresh_token: 'refresh' }, { access_token: 'access', refresh_token: null }])(
		'cannot delete without a usable fresh challenge result: %j',
		async (data) => {
			const h = harness();
			h.mfa.challengeAndVerify.mockResolvedValueOnce({ data, error: null } as never);
			expect((await h.request()).status).toBe(503);
			expect(h.mfa.unenroll).not.toHaveBeenCalled();
		}
	);

	it.each(['listFactors', 'challengeAndVerify', 'unenroll'] as const)(
		'handles thrown %s failure without losing the factor',
		async (operation) => {
			const h = harness();
			h.mfa[operation].mockRejectedValueOnce(new Error('provider-private-details'));
			const response = await h.request();
			expect(response.status).toBe(503);
			expect(await response.text()).not.toContain('provider-private-details');
			expect(h.factors.map((factor) => factor.id)).toContain('owned-totp');
			if (operation !== 'unenroll') expect(h.mfa.unenroll).not.toHaveBeenCalled();
		}
	);

	it('requires a new successful challenge on retry after removal failure', async () => {
		const h = harness();
		h.mfa.unenroll.mockResolvedValueOnce({
			data: { id: 'owned-totp' },
			error: { message: 'Removal unavailable' }
		} as never);
		expect((await h.request()).status).toBe(401);
		expect(h.factors.map((factor) => factor.id)).toContain('owned-totp');
		h.mfa.challengeAndVerify.mockResolvedValueOnce({ data: null, error: { message: 'Code already used' } } as never);
		expect((await h.request()).status).toBe(401);
		expect(h.mfa.unenroll).toHaveBeenCalledTimes(1);
		expect((await h.request(JSON.stringify({ code: '654321' }))).status).toBe(200);
		expect(h.mfa.challengeAndVerify).toHaveBeenLastCalledWith({ factorId: 'owned-totp', code: '654321' });
		expect(h.factors.map((factor) => factor.id)).toEqual(['pending-sibling', 'phone-sibling']);
	});

	it.each([null, {}, { id: 'different-factor' }])(
		'does not report success for an unconfirmed removal: %j',
		async (data) => {
			const h = harness();
			h.mfa.unenroll.mockResolvedValueOnce({ data, error: null } as never);
			expect((await h.request()).status).toBe(503);
		}
	);
});

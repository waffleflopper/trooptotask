import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

describe('POST /api/auth/mfa/verify', () => {
	it('verifies the code against the current verified TOTP factor', async () => {
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
				all: [{ id: 'factor-unverified', factor_type: 'totp', status: 'unverified' }]
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
				all: [{ id: 'factor-verified', factor_type: 'totp', status: 'verified' }]
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

describe('verified-factor challenge boundary', () => {
	function harness() {
		const factors = [
			{ id: 'pending-sibling', factor_type: 'totp', status: 'unverified' },
			{ id: 'owned-totp', factor_type: 'totp', status: 'verified' },
			{ id: 'phone-sibling', factor_type: 'phone', status: 'verified' }
		];
		const session = { currentLevel: 'aal1' };
		const tokens = { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' };
		const mfa = {
			listFactors: vi.fn(async () => ({
				data: { all: factors, totp: factors.filter((f) => f.factor_type === 'totp') },
				error: null
			})),
			challengeAndVerify: vi.fn(async ({ factorId }: { factorId: string; code: string }) => {
				if (factorId !== 'owned-totp') throw new Error('Wrong factor');
				session.currentLevel = 'aal2';
				return { data: tokens, error: null };
			})
		};
		const request = (body = JSON.stringify({ code: '123456' })) =>
			POST({
				request: new Request('http://localhost/api/auth/mfa/verify', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body
				}),
				locals: { supabase: { auth: { mfa } } }
			} as unknown as Parameters<typeof POST>[0]);
		return { factors, session, tokens, mfa, request };
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
	])('rejects malformed request %s before authentication effects', async (body) => {
		const h = harness();
		expect((await h.request(body)).status).toBe(400);
		expect(h.mfa.listFactors).not.toHaveBeenCalled();
		expect(h.mfa.challengeAndVerify).not.toHaveBeenCalled();
		expect(h.session.currentLevel).toBe('aal1');
	});

	it('uses only the authenticated verified TOTP, advances assurance and returns no tokens', async () => {
		const h = harness();
		const before = structuredClone(h.factors);
		const response = await h.request(
			JSON.stringify({ code: '123456', factorId: 'foreign-factor', userId: 'other-user' })
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(h.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'owned-totp', code: '123456' });
		expect(h.session.currentLevel).toBe('aal2');
		expect(h.factors).toEqual(before);
	});

	it('cannot confirm enrollment or select a foreign factor when no owned verified TOTP exists', async () => {
		const h = harness();
		h.factors.splice(1, 1);
		const before = structuredClone(h.factors);
		expect((await h.request(JSON.stringify({ code: '123456', factorId: 'foreign-factor' }))).status).toBe(400);
		expect(h.mfa.challengeAndVerify).not.toHaveBeenCalled();
		expect(h.session.currentLevel).toBe('aal1');
		expect(h.factors).toEqual(before);
	});

	it.each(['missing data', 'data plus error'])('denies a failed lookup: %s', async (failure) => {
		const h = harness();
		h.mfa.listFactors.mockResolvedValueOnce({
			data:
				failure === 'missing data' ? null : { all: h.factors, totp: h.factors.filter((f) => f.factor_type === 'totp') },
			error: failure === 'missing data' ? null : { message: 'Lookup unavailable' }
		} as never);
		expect((await h.request()).status).toBe(503);
		expect(h.mfa.challengeAndVerify).not.toHaveBeenCalled();
		expect(h.session.currentLevel).toBe('aal1');
	});

	it.each(['invalid', 'expired', 'replayed'])(
		'rejects a provider-denied %s code even with accompanying data, then permits retry',
		async (reason) => {
			const h = harness();
			const before = structuredClone(h.factors);
			h.mfa.challengeAndVerify.mockResolvedValueOnce({ data: h.tokens, error: { message: reason } } as never);
			const response = await h.request();
			expect(response.status).toBe(401);
			expect(await response.json()).toEqual({ error: reason });
			expect(h.session.currentLevel).toBe('aal1');
			expect(h.factors).toEqual(before);
			expect((await h.request(JSON.stringify({ code: '654321' }))).status).toBe(200);
			expect(h.session.currentLevel).toBe('aal2');
		}
	);

	it.each([null, {}, { access_token: '', refresh_token: 'refresh' }, { access_token: 'access', refresh_token: null }])(
		'requires a usable challenge result: %j',
		async (data) => {
			const h = harness();
			h.mfa.challengeAndVerify.mockResolvedValueOnce({ data, error: null } as never);
			expect((await h.request()).status).toBe(503);
			expect(h.session.currentLevel).toBe('aal1');
		}
	);

	it.each(['listFactors', 'challengeAndVerify'] as const)(
		'handles thrown %s failure without reporting successful authentication',
		async (operation) => {
			const h = harness();
			h.mfa[operation].mockRejectedValueOnce(new Error('private provider details'));
			const response = await h.request();
			expect(response.status).toBe(503);
			expect(await response.text()).not.toContain('private provider details');
			expect(h.session.currentLevel).toBe('aal1');
		}
	);
});

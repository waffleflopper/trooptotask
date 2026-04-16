import { describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';

describe('GET /auth/confirm', () => {
	it('renders a confirmation state for a valid invite link without verifying the token', async () => {
		const verifyOtp = vi.fn();

		const result = await load({
			url: new URL('http://localhost/auth/confirm?token_hash=invite-token&type=invite&next=%2Fauth%2Faccept-invite'),
			locals: {
				supabase: {
					auth: {
						verifyOtp
					}
				}
			}
		} as unknown as Parameters<typeof load>[0]);

		expect(result).toEqual({
			confirmation: {
				status: 'valid',
				tokenHash: 'invite-token',
				type: 'invite',
				next: '/auth/accept-invite'
			}
		});
		expect(verifyOtp).not.toHaveBeenCalled();
	});

	it('renders a confirmation state for a valid recovery link without verifying the token', async () => {
		const verifyOtp = vi.fn();

		const result = await load({
			url: new URL(
				'http://localhost/auth/confirm?token_hash=recovery-token&type=recovery&next=%2Fauth%2Freset-password'
			),
			locals: {
				supabase: {
					auth: {
						verifyOtp
					}
				}
			}
		} as unknown as Parameters<typeof load>[0]);

		expect(result).toEqual({
			confirmation: {
				status: 'valid',
				tokenHash: 'recovery-token',
				type: 'recovery',
				next: '/auth/reset-password'
			}
		});
		expect(verifyOtp).not.toHaveBeenCalled();
	});

	it('returns an invalid confirmation state when the token is missing', async () => {
		const result = await load({
			url: new URL('http://localhost/auth/confirm?type=invite&next=%2Fauth%2Faccept-invite'),
			locals: {}
		} as unknown as Parameters<typeof load>[0]);

		expect(result).toEqual({
			confirmation: {
				status: 'invalid'
			}
		});
	});

	it('returns an invalid confirmation state for unsupported email types', async () => {
		const result = await load({
			url: new URL('http://localhost/auth/confirm?token_hash=signup-token&type=email&next=%2Fauth%2Faccept-invite'),
			locals: {}
		} as unknown as Parameters<typeof load>[0]);

		expect(result).toEqual({
			confirmation: {
				status: 'invalid'
			}
		});
	});
});

describe('POST /auth/confirm', () => {
	it('verifies a valid invite token and redirects to the invite flow', async () => {
		const verifyOtp = vi.fn().mockResolvedValue({ error: null });
		const cookies = { set: vi.fn() };

		await expect(
			actions.default({
				request: new Request('http://localhost/auth/confirm', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({
						tokenHash: 'invite-token',
						type: 'invite',
						next: '/auth/accept-invite'
					})
				}),
				locals: {
					supabase: {
						auth: {
							verifyOtp
						}
					}
				},
				cookies
			} as unknown as Parameters<(typeof actions)['default']>[0])
		).rejects.toMatchObject({
			status: 303,
			location: '/auth/accept-invite'
		});

		expect(verifyOtp).toHaveBeenCalledWith({
			token_hash: 'invite-token',
			type: 'invite'
		});
		expect(cookies.set).toHaveBeenCalledWith(
			'ttt_pending_auth_flow',
			'invite',
			expect.objectContaining({
				path: '/',
				httpOnly: true,
				sameSite: 'lax'
			})
		);
	});

	it('verifies a valid recovery token and redirects to the reset-password flow', async () => {
		const verifyOtp = vi.fn().mockResolvedValue({ error: null });
		const cookies = { set: vi.fn() };

		await expect(
			actions.default({
				request: new Request('http://localhost/auth/confirm', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({
						tokenHash: 'recovery-token',
						type: 'recovery',
						next: '/auth/reset-password'
					})
				}),
				locals: {
					supabase: {
						auth: {
							verifyOtp
						}
					}
				},
				cookies
			} as unknown as Parameters<(typeof actions)['default']>[0])
		).rejects.toMatchObject({
			status: 303,
			location: '/auth/reset-password'
		});

		expect(verifyOtp).toHaveBeenCalledWith({
			token_hash: 'recovery-token',
			type: 'recovery'
		});
		expect(cookies.set).toHaveBeenCalledWith(
			'ttt_pending_auth_flow',
			'recovery',
			expect.objectContaining({
				path: '/',
				httpOnly: true,
				sameSite: 'lax'
			})
		);
	});

	it('redirects to login instead of following an unsafe next destination', async () => {
		const verifyOtp = vi.fn();

		await expect(
			actions.default({
				request: new Request('http://localhost/auth/confirm', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({
						tokenHash: 'invite-token',
						type: 'invite',
						next: 'https://evil.example/offsite'
					})
				}),
				locals: {
					supabase: {
						auth: {
							verifyOtp
						}
					}
				},
				cookies: { set: vi.fn() }
			} as unknown as Parameters<(typeof actions)['default']>[0])
		).rejects.toMatchObject({
			status: 303,
			location: '/auth/login?error=auth_link_invalid'
		});

		expect(verifyOtp).not.toHaveBeenCalled();
	});

	it('redirects to login when Supabase rejects the verification attempt', async () => {
		const verifyOtp = vi.fn().mockResolvedValue({
			error: { message: 'Token has expired or is invalid' }
		});

		await expect(
			actions.default({
				request: new Request('http://localhost/auth/confirm', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({
						tokenHash: 'invite-token',
						type: 'invite',
						next: '/auth/accept-invite'
					})
				}),
				locals: {
					supabase: {
						auth: {
							verifyOtp
						}
					}
				},
				cookies: { set: vi.fn() }
			} as unknown as Parameters<(typeof actions)['default']>[0])
		).rejects.toMatchObject({
			status: 303,
			location: '/auth/login?error=auth_link_invalid'
		});
	});
});

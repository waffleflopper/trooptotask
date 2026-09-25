import { describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';

const verifiedUser = { id: 'verified-user' };
const verifiedSession = {
	user: verifiedUser,
	access_token: `header.${Buffer.from(
		JSON.stringify({
			sub: verifiedUser.id,
			session_id: '00000000-0000-4000-8000-000000000001',
			amr: [{ method: 'otp' }]
		})
	).toString('base64url')}.signature`
};
const verifiedFlowResult = () => ({ data: { user: verifiedUser, session: verifiedSession }, error: null });

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

	it('renders a confirmation state for a valid signup email link without verifying the token', async () => {
		const verifyOtp = vi.fn();

		const result = await load({
			url: new URL('http://localhost/auth/confirm?token_hash=signup-token&type=email&next=%2Forg%2Fnew'),
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
				tokenHash: 'signup-token',
				type: 'email',
				next: '/org/new'
			}
		});
		expect(verifyOtp).not.toHaveBeenCalled();
	});

	it('renders a confirmation state for an invitation-aware signup email link', async () => {
		const verifyOtp = vi.fn();

		const result = await load({
			url: new URL('http://localhost/auth/confirm?token_hash=signup-token&type=email&next=%2Fdashboard'),
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
				tokenHash: 'signup-token',
				type: 'email',
				next: '/dashboard'
			}
		});
		expect(verifyOtp).not.toHaveBeenCalled();
	});

	it('renders a confirmation state for the provider signup alias without verifying the token', async () => {
		const verifyOtp = vi.fn();

		const result = await load({
			url: new URL('http://localhost/auth/confirm?token_hash=signup-token&type=signup&next=%2Forg%2Fnew'),
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
				tokenHash: 'signup-token',
				type: 'signup',
				next: '/org/new'
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
			url: new URL('http://localhost/auth/confirm?token_hash=magic-token&type=magiclink&next=%2Forg%2Fnew'),
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
		const verifyOtp = vi.fn().mockResolvedValue(verifiedFlowResult());
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
			expect.any(String),
			expect.objectContaining({
				path: '/',
				httpOnly: true,
				sameSite: 'lax'
			})
		);
		const marker = cookies.set.mock.calls[0][1];
		expect(marker).not.toBe('invite');
	});

	it('does not reestablish the invite flow when the provider rejects a replayed confirmation', async () => {
		const verifyOtp = vi
			.fn()
			.mockResolvedValueOnce(verifiedFlowResult())
			.mockResolvedValueOnce({ error: { code: 'otp_expired' } });
		const cookies = { set: vi.fn() };
		const from = vi.fn(() => {
			throw new Error('Confirmation must not create membership');
		});
		const event = () =>
			({
				request: new Request('http://localhost/auth/confirm', {
					method: 'POST',
					body: new URLSearchParams({ tokenHash: 'invite-token', type: 'invite', next: '/auth/accept-invite' })
				}),
				locals: { supabase: { auth: { verifyOtp }, from } },
				cookies
			}) as unknown as Parameters<(typeof actions)['default']>[0];
		await expect(actions.default(event())).rejects.toMatchObject({ status: 303, location: '/auth/accept-invite' });
		cookies.set.mockClear();
		await expect(actions.default(event())).rejects.toMatchObject({
			status: 303,
			location: '/auth/login?error=auth_link_invalid'
		});
		expect(cookies.set).not.toHaveBeenCalled();
		expect(from).not.toHaveBeenCalled();
	});

	it('verifies a valid recovery token and redirects to the reset-password flow', async () => {
		const verifyOtp = vi.fn().mockResolvedValue(verifiedFlowResult());
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
			expect.any(String),
			expect.objectContaining({
				path: '/',
				httpOnly: true,
				sameSite: 'lax'
			})
		);
		const marker = cookies.set.mock.calls[0][1];
		expect(marker).not.toBe('recovery');
	});

	it('verifies a valid signup email token even when the provider returns no session', async () => {
		const verifyOtp = vi.fn().mockResolvedValue({ error: null });
		const cookies = { set: vi.fn() };

		await expect(
			actions.default({
				request: new Request('http://localhost/auth/confirm', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({
						tokenHash: 'signup-token',
						type: 'email',
						next: '/org/new'
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
			location: '/org/new'
		});

		expect(verifyOtp).toHaveBeenCalledWith({
			token_hash: 'signup-token',
			type: 'email'
		});
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('binds an email confirmation session only for the same already admitted account', async () => {
		const verifyOtp = vi.fn().mockResolvedValue(verifiedFlowResult());
		const cookies = { set: vi.fn() };
		await expect(
			actions.default({
				request: new Request('http://localhost/auth/confirm', {
					method: 'POST',
					body: new URLSearchParams({ tokenHash: 'email-token', type: 'email', next: '/dashboard' })
				}),
				locals: { supabase: { auth: { verifyOtp } }, actor: { userId: verifiedUser.id } },
				cookies
			} as unknown as Parameters<(typeof actions)['default']>[0])
		).rejects.toMatchObject({ status: 303, location: '/dashboard' });
		expect(cookies.set).toHaveBeenCalledWith('ttt_pending_auth_flow', expect.any(String), expect.any(Object));
	});

	it.each(['email', 'signup'])('does not admit a new %s OTP session from confirmation alone', async (type) => {
		const verifyOtp = vi.fn().mockResolvedValue(verifiedFlowResult());
		const cookies = { set: vi.fn() };
		await expect(
			actions.default({
				request: new Request('http://localhost/auth/confirm', {
					method: 'POST',
					body: new URLSearchParams({ tokenHash: 'signup-token', type, next: '/org/new' })
				}),
				locals: { supabase: { auth: { verifyOtp } }, actor: null },
				cookies
			} as unknown as Parameters<(typeof actions)['default']>[0])
		).rejects.toMatchObject({ status: 303, location: '/org/new' });
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('verifies an invitation-aware signup email token and redirects to the dashboard without accepting the invitation', async () => {
		const verifyOtp = vi.fn().mockResolvedValue({ error: null });
		const cookies = { set: vi.fn() };

		await expect(
			actions.default({
				request: new Request('http://localhost/auth/confirm', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({
						tokenHash: 'signup-token',
						type: 'email',
						next: '/dashboard'
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
			location: '/dashboard'
		});

		expect(verifyOtp).toHaveBeenCalledWith({
			token_hash: 'signup-token',
			type: 'email'
		});
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('verifies a provider signup token even when the provider returns no session', async () => {
		const verifyOtp = vi.fn().mockResolvedValue({ error: null });
		const cookies = { set: vi.fn() };

		await expect(
			actions.default({
				request: new Request('http://localhost/auth/confirm', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({
						tokenHash: 'signup-token',
						type: 'signup',
						next: '/org/new'
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
			location: '/org/new'
		});

		expect(verifyOtp).toHaveBeenCalledWith({
			token_hash: 'signup-token',
			type: 'signup'
		});
		expect(cookies.set).not.toHaveBeenCalled();
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

	it('redirects to login instead of accepting a signup email link with an invite destination', async () => {
		const verifyOtp = vi.fn();

		await expect(
			actions.default({
				request: new Request('http://localhost/auth/confirm', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({
						tokenHash: 'signup-token',
						type: 'email',
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

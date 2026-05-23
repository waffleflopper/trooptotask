import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auditLogMock, checkPasswordUpdateRateLimitMock } = vi.hoisted(() => ({
	auditLogMock: vi.fn(),
	checkPasswordUpdateRateLimitMock: vi.fn()
}));

vi.mock('$lib/server/auditLog', () => ({
	auditLog: auditLogMock
}));

vi.mock('$lib/server/passwordUpdateRateLimit', () => ({
	PASSWORD_UPDATE_RATE_LIMIT_MESSAGE: 'Too many password update attempts. Please wait before trying again.',
	checkPasswordUpdateRateLimit: checkPasswordUpdateRateLimitMock,
	passwordUpdateRateLimitAuditDetails: vi.fn((decision) => ({
		namespace: decision.namespace,
		dimensions: decision.dimensions,
		limitedDimensions: decision.limitedDimensions,
		windowMs: decision.windowMs,
		maxRequests: decision.maxRequests,
		...(decision.retryAfterMs ? { retryAfterMs: decision.retryAfterMs } : {})
	}))
}));

import { POST } from './+server';

function makeEvent(input: {
	body: Record<string, unknown>;
	locals: Record<string, unknown>;
	cookies?: { delete: ReturnType<typeof vi.fn> };
	ip?: string;
}) {
	return {
		request: new Request('http://localhost/api/auth/update-password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'user-agent': 'vitest-agent' },
			body: JSON.stringify(input.body)
		}),
		locals: input.locals,
		cookies: input.cookies ?? { delete: vi.fn() },
		getClientAddress: vi.fn(() => input.ip ?? '203.0.113.10')
	} as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/auth/update-password', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		checkPasswordUpdateRateLimitMock.mockResolvedValue({
			limited: false,
			namespace: 'password-update',
			dimensions: ['user', 'ip'],
			limitedDimensions: [],
			windowMs: 15 * 60 * 1000,
			maxRequests: 5
		});
	});

	it('updates the current user password after verifying the old password', async () => {
		const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
		const updateUser = vi.fn().mockResolvedValue({ error: null });
		const cookies = { delete: vi.fn() };

		const response = await POST(
			makeEvent({
				body: {
					currentPassword: 'OldSecurePass12',
					password: 'SecurePass12',
					confirmPassword: 'SecurePass12'
				},
				locals: {
					session: { user: { id: 'user-123' } },
					user: { id: 'user-123', email: 'user@example.test' },
					supabase: {
						auth: {
							signInWithPassword,
							updateUser
						}
					}
				},
				cookies
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(checkPasswordUpdateRateLimitMock).toHaveBeenCalledWith({
			userId: 'user-123',
			ip: '203.0.113.10'
		});
		expect(signInWithPassword).toHaveBeenCalledWith({
			email: 'user@example.test',
			password: 'OldSecurePass12'
		});
		expect(updateUser).toHaveBeenCalledWith({ password: 'SecurePass12' });
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it('rate-limits in-app password updates before current-password verification', async () => {
		const signInWithPassword = vi.fn();
		const updateUser = vi.fn();
		checkPasswordUpdateRateLimitMock.mockResolvedValueOnce({
			limited: true,
			namespace: 'password-update',
			dimensions: ['user', 'ip'],
			limitedDimensions: ['user'],
			windowMs: 15 * 60 * 1000,
			maxRequests: 5,
			retryAfterMs: 120_000
		});

		const response = await POST(
			makeEvent({
				body: {
					currentPassword: 'OldSecurePass12',
					password: 'SecurePass12',
					confirmPassword: 'SecurePass12'
				},
				locals: {
					session: { user: { id: 'user-123' } },
					user: { id: 'user-123', email: 'user@example.test' },
					supabase: {
						auth: {
							signInWithPassword,
							updateUser
						}
					}
				}
			})
		);

		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('120');
		expect(await response.json()).toEqual({
			error: 'Too many password update attempts. Please wait before trying again.',
			retryAfterSeconds: 120
		});
		expect(signInWithPassword).not.toHaveBeenCalled();
		expect(updateUser).not.toHaveBeenCalled();
		expect(auditLogMock).toHaveBeenCalledWith(
			{
				action: 'auth.password_update_rate_limited',
				resourceType: 'user',
				resourceId: 'user-123',
				severity: 'warning',
				details: expect.objectContaining({
					namespace: 'password-update',
					limitedDimensions: ['user'],
					retryAfterMs: 120_000
				})
			},
			{
				userId: 'user-123',
				userEmail: 'user@example.test',
				ip: '203.0.113.10',
				userAgent: 'vitest-agent'
			}
		);
	});

	it('rejects in-app password updates when the old password is missing', async () => {
		const signInWithPassword = vi.fn();
		const updateUser = vi.fn();
		const cookies = { delete: vi.fn() };

		const response = await POST({
			request: new Request('http://localhost/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'SecurePass12', confirmPassword: 'SecurePass12' })
			}),
			locals: {
				session: { user: { id: 'user-123' } },
				user: { id: 'user-123', email: 'user@example.test' },
				supabase: {
					auth: {
						signInWithPassword,
						updateUser
					}
				}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Current password is required' });
		expect(signInWithPassword).not.toHaveBeenCalled();
		expect(updateUser).not.toHaveBeenCalled();
	});

	it('rejects in-app password updates when the old password is incorrect', async () => {
		const signInWithPassword = vi.fn().mockResolvedValue({ error: { message: 'Invalid login credentials' } });
		const updateUser = vi.fn();
		const cookies = { delete: vi.fn() };

		const response = await POST(
			makeEvent({
				body: {
					currentPassword: 'WrongSecurePass12',
					password: 'SecurePass12',
					confirmPassword: 'SecurePass12'
				},
				locals: {
					session: { user: { id: 'user-123' } },
					user: { id: 'user-123', email: 'user@example.test' },
					supabase: {
						auth: {
							signInWithPassword,
							updateUser
						}
					}
				},
				cookies
			})
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Current password is incorrect' });
		expect(updateUser).not.toHaveBeenCalled();
	});

	it('rejects passwords that do not meet policy', async () => {
		const updateUser = vi.fn();
		const cookies = { delete: vi.fn() };

		const response = await POST({
			request: new Request('http://localhost/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'short' })
			}),
			locals: {
				session: { user: { id: 'user-123' } },
				authFlow: 'recovery',
				supabase: {
					auth: {
						updateUser
					}
				}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'Password must be at least 12 characters'
		});
		expect(updateUser).not.toHaveBeenCalled();
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it('returns an auth error when Supabase rejects the password update', async () => {
		const updateUser = vi.fn().mockResolvedValue({
			error: { message: 'Password update failed.' }
		});
		const cookies = { delete: vi.fn() };

		const response = await POST({
			request: new Request('http://localhost/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'SecurePass12' })
			}),
			locals: {
				session: { user: { id: 'user-123' } },
				authFlow: 'recovery',
				supabase: {
					auth: {
						updateUser
					}
				}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Password update failed'
		});
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it('returns stable policy copy when Supabase rejects the new password as weak', async () => {
		const updateUser = vi.fn().mockResolvedValue({
			error: { message: 'Password should be at least 12 characters' }
		});
		const cookies = { delete: vi.fn() };

		const response = await POST({
			request: new Request('http://localhost/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'SecurePass12' })
			}),
			locals: {
				session: { user: { id: 'user-123' } },
				authFlow: 'recovery',
				supabase: {
					auth: {
						updateUser
					}
				}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error:
				'That password was rejected by account security rules. Use at least 12 characters with uppercase, lowercase, and a number.'
		});
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it('updates the password for an active recovery session and clears the recovery flow marker', async () => {
		const updateUser = vi.fn().mockResolvedValue({ error: null });
		const cookies = { delete: vi.fn() };

		const response = await POST({
			request: new Request('http://localhost/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'SecurePass12' })
			}),
			locals: {
				session: { user: { id: 'user-123' } },
				authFlow: 'recovery',
				supabase: {
					auth: {
						updateUser
					}
				}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(updateUser).toHaveBeenCalledWith({ password: 'SecurePass12' });
		expect(cookies.delete).toHaveBeenCalledWith('ttt_pending_auth_flow', { path: '/' });
	});

	it('returns an auth error when the recovery or invite session is missing', async () => {
		const updateUser = vi.fn();
		const cookies = { delete: vi.fn() };

		const response = await POST({
			request: new Request('http://localhost/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'SecurePass12' })
			}),
			locals: {
				supabase: {
					auth: {
						updateUser
					}
				}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Your account recovery session is no longer active. Please reopen the link and try again.'
		});
		expect(updateUser).not.toHaveBeenCalled();
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it('does not clear the pending flow marker for invite sessions before invite finalization finishes', async () => {
		const updateUser = vi.fn().mockResolvedValue({ error: null });
		const cookies = { delete: vi.fn() };

		const response = await POST({
			request: new Request('http://localhost/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'SecurePass12' })
			}),
			locals: {
				session: { user: { id: 'user-123' } },
				authFlow: 'invite',
				supabase: {
					auth: {
						updateUser
					}
				}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(updateUser).toHaveBeenCalledWith({ password: 'SecurePass12' });
		expect(cookies.delete).not.toHaveBeenCalled();
	});
});

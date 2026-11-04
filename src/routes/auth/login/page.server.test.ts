import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { auditLogMock } = vi.hoisted(() => ({
	auditLogMock: vi.fn()
}));

vi.mock('$lib/audit/index.server', () => ({
	auditLog: auditLogMock
}));

const { limitStore } = vi.hoisted(() => ({
	limitStore: { buckets: new Map<string, { count: number; resetAt: number }>(), unavailable: false }
}));

vi.mock('$lib/server/supabase', () => ({
	getAdminClient: () => ({
		rpc: async (
			_name: string,
			args: { p_bucket_key: string; p_window_seconds: number; p_max_requests: number; p_checked_at: string }
		) => {
			if (limitStore.unavailable) return { data: null, error: { message: 'limit store unavailable' } };
			const now = Date.parse(args.p_checked_at);
			const current = limitStore.buckets.get(args.p_bucket_key);
			if (!current || current.resetAt <= now) {
				limitStore.buckets.set(args.p_bucket_key, { count: 1, resetAt: now + args.p_window_seconds * 1000 });
				return { data: [{ limited: false, retry_after_ms: 0 }], error: null };
			}
			current.count += 1;
			return current.count > args.p_max_requests
				? { data: [{ limited: true, retry_after_ms: current.resetAt - now }], error: null }
				: { data: [{ limited: false, retry_after_ms: 0 }], error: null };
		}
	})
}));

import { actions, load } from './+page.server';

afterEach(() => {
	vi.useRealTimers();
});

beforeEach(() => {
	vi.clearAllMocks();
	limitStore.buckets.clear();
	limitStore.unavailable = false;
});

describe('GET /auth/login', () => {
	it('surfaces a generic auth-link error when redirected from a failed confirmation flow', async () => {
		const result = await load({
			locals: {
				session: null,
				authFlow: null,
				mfaPending: false
			},
			url: new URL('http://localhost/auth/login?error=auth_link_invalid')
		} as unknown as Parameters<typeof load>[0]);

		expect(result).toEqual({
			reauth: false,
			nextPath: null,
			authLinkError:
				'This email link is invalid or has expired. Request a fresh account setup link or password reset email and try again.'
		});
	});

	it('allows an authenticated reauth request to render the login form with a safe return path', async () => {
		const result = await load({
			locals: {
				session: { user: { id: 'user-1' } },
				authFlow: null,
				mfaPending: false
			},
			url: new URL('http://localhost/auth/login?reauth=1&next=/org/local-dev-test/settings')
		} as unknown as Parameters<typeof load>[0]);

		expect(result).toEqual({
			reauth: true,
			nextPath: '/org/local-dev-test/settings'
		});
	});

	it('drops unsafe external return paths during load', async () => {
		const result = await load({
			locals: {
				session: null,
				authFlow: null,
				mfaPending: false
			},
			url: new URL('http://localhost/auth/login?next=https://evil.example/phish')
		} as unknown as Parameters<typeof load>[0]);

		expect(result).toEqual({
			reauth: false,
			nextPath: null
		});
	});

	it('drops malformed return paths during load', async () => {
		const result = await load({
			locals: {
				session: null,
				authFlow: null,
				mfaPending: false
			},
			url: new URL('http://localhost/auth/login?next=/..//admin')
		} as unknown as Parameters<typeof load>[0]);

		expect(result).toEqual({
			reauth: false,
			nextPath: null
		});
	});

	it('redirects to the safe return path after a successful reauth login', async () => {
		const signInWithPassword = vi.fn().mockResolvedValue({
			data: {
				user: { id: 'user-1' },
				session: { user: { id: 'user-1' }, access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' }
			},
			error: null
		});
		const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
			data: { currentLevel: 'aal1', nextLevel: 'aal1' }
		});
		const formData = new FormData();
		formData.set('email', 'owner@example.com');
		formData.set('password', 'correct-password');
		formData.set('next', '/org/local-dev-test/settings');

		await expect(
			actions.login({
				getClientAddress: () => '198.51.100.1',
				request: new Request('http://localhost/auth/login?/login', {
					method: 'POST',
					body: formData
				}),
				locals: {
					supabase: {
						auth: {
							signInWithPassword,
							mfa: { getAuthenticatorAssuranceLevel }
						}
					}
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/org/local-dev-test/settings'
		});

		expect(signInWithPassword).toHaveBeenCalledWith({
			email: 'owner@example.com',
			password: 'correct-password'
		});
	});

	it('redirects to dashboard instead of unsafe form next values after login', async () => {
		const signInWithPassword = vi.fn().mockResolvedValue({
			data: {
				user: { id: 'user-1' },
				session: { user: { id: 'user-1' }, access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' }
			},
			error: null
		});
		const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
			data: { currentLevel: 'aal1', nextLevel: 'aal1' }
		});
		const formData = new FormData();
		formData.set('email', 'owner@example.com');
		formData.set('password', 'correct-password');
		formData.set('next', '//evil.example/phish');

		await expect(
			actions.login({
				getClientAddress: () => '198.51.100.1',
				request: new Request('http://localhost/auth/login?/login', {
					method: 'POST',
					body: formData
				}),
				locals: {
					supabase: {
						auth: {
							signInWithPassword,
							mfa: { getAuthenticatorAssuranceLevel }
						}
					}
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/dashboard'
		});
	});

	it('redirects to dashboard instead of form next values that normalize to protocol-relative paths', async () => {
		const signInWithPassword = vi.fn().mockResolvedValue({
			data: {
				user: { id: 'user-1' },
				session: { user: { id: 'user-1' }, access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' }
			},
			error: null
		});
		const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
			data: { currentLevel: 'aal1', nextLevel: 'aal1' }
		});
		const formData = new FormData();
		formData.set('email', 'owner@example.com');
		formData.set('password', 'correct-password');
		formData.set('next', '/..//admin');

		await expect(
			actions.login({
				getClientAddress: () => '198.51.100.1',
				request: new Request('http://localhost/auth/login?/login', {
					method: 'POST',
					body: formData
				}),
				locals: {
					supabase: {
						auth: {
							signInWithPassword,
							mfa: { getAuthenticatorAssuranceLevel }
						}
					}
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/dashboard'
		});
	});

	it('returns a generic login failure while preserving the audit event', async () => {
		const signInWithPassword = vi.fn().mockResolvedValue({ error: { message: 'Email not confirmed' } });
		const formData = new FormData();
		formData.set('email', 'OWNER@EXAMPLE.COM');
		formData.set('password', 'wrong-password');
		formData.set('next', '/dashboard');

		const result = await actions.login({
			getClientAddress: () => '198.51.100.1',
			request: new Request('http://localhost/auth/login?/login', {
				method: 'POST',
				body: formData
			}),
			locals: {
				supabase: {
					auth: {
						signInWithPassword
					}
				}
			}
		} as never);

		expect(result).toEqual({
			status: 400,
			data: {
				error: 'Email or password is incorrect',
				email: 'owner@example.com',
				nextPath: '/dashboard'
			}
		});
		expect(JSON.stringify(result)).not.toContain('Email not confirmed');
		expect(auditLogMock).toHaveBeenCalledWith(
			{
				action: 'auth.login_failure',
				resourceType: 'user',
				severity: 'warning',
				details: { email: 'owner@example.com' }
			},
			{ userId: null }
		);
	});
});

describe('sign-in attempt limits', () => {
	function signIn(email: string, ip: string) {
		const signInWithPassword = vi.fn().mockResolvedValue({ error: { message: 'Invalid login credentials' } });
		const setHeaders = vi.fn();
		const formData = new FormData();
		formData.set('email', email);
		formData.set('password', 'guess');
		formData.set('next', '/dashboard');
		const run = () =>
			actions.login({
				getClientAddress: () => ip,
				setHeaders,
				request: new Request('http://localhost/auth/login?/login', { method: 'POST', body: formData }),
				locals: { supabase: { auth: { signInWithPassword } } }
			} as never);
		return { signInWithPassword, setHeaders, run };
	}

	it('refuses the eleventh attempt on one account from a fresh address before asking the provider', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
		let providerCalls = 0;
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const request = signIn('Owner@Example.com', `198.51.100.${attempt}`);
			expect(await request.run()).toMatchObject({ status: 400 });
			providerCalls += request.signInWithPassword.mock.calls.length;
		}
		expect(providerCalls).toBe(10);

		const refused = signIn('owner@example.com', '203.0.113.50');
		expect(await refused.run()).toEqual({
			status: 429,
			data: {
				error: expect.any(String),
				email: 'owner@example.com',
				nextPath: '/dashboard'
			}
		});
		expect(refused.setHeaders).toHaveBeenCalledWith({ 'Retry-After': '900' });
		expect(refused.signInWithPassword).not.toHaveBeenCalled();

		const otherAccount = signIn('other@example.com', '203.0.113.50');
		expect(await otherAccount.run()).toMatchObject({ status: 400 });
		expect(otherAccount.signInWithPassword).toHaveBeenCalledTimes(1);
	});

	it('does not ask the provider when the limit cannot be read', async () => {
		limitStore.unavailable = true;
		const request = signIn('owner@example.com', '198.51.100.1');

		expect(await request.run()).toEqual({
			status: 503,
			data: {
				error: expect.any(String),
				email: 'owner@example.com',
				nextPath: '/dashboard'
			}
		});
		expect(request.signInWithPassword).not.toHaveBeenCalled();
	});
});

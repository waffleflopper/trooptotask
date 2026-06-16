import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auditLogMock } = vi.hoisted(() => ({
	auditLogMock: vi.fn()
}));

vi.mock('$lib/server/auditLog', () => ({
	auditLog: auditLogMock
}));

import { actions, load } from './+page.server';

beforeEach(() => {
	vi.clearAllMocks();
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
				'This email link is invalid or has expired. Request a fresh invite or password reset email and try again.'
		});
	});

	it('allows an authenticated reauth request to render the login form with a safe return path', async () => {
		const result = await load({
			locals: {
				session: { user: { id: 'user-1' } },
				authFlow: null,
				mfaPending: false
			},
			url: new URL('http://localhost/auth/login?reauth=1&next=/org/local-dev-test/billing')
		} as unknown as Parameters<typeof load>[0]);

		expect(result).toEqual({
			reauth: true,
			nextPath: '/org/local-dev-test/billing'
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
		const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
		const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
			data: { currentLevel: 'aal1', nextLevel: 'aal1' }
		});
		const formData = new FormData();
		formData.set('email', 'owner@example.com');
		formData.set('password', 'correct-password');
		formData.set('next', '/org/local-dev-test/billing');

		await expect(
			actions.login({
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
			location: '/org/local-dev-test/billing'
		});

		expect(signInWithPassword).toHaveBeenCalledWith({
			email: 'owner@example.com',
			password: 'correct-password'
		});
	});

	it('redirects to dashboard instead of unsafe form next values after login', async () => {
		const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
		const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
			data: { currentLevel: 'aal1', nextLevel: 'aal1' }
		});
		const formData = new FormData();
		formData.set('email', 'owner@example.com');
		formData.set('password', 'correct-password');
		formData.set('next', '//evil.example/phish');

		await expect(
			actions.login({
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
		const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
		const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
			data: { currentLevel: 'aal1', nextLevel: 'aal1' }
		});
		const formData = new FormData();
		formData.set('email', 'owner@example.com');
		formData.set('password', 'correct-password');
		formData.set('next', '/..//admin');

		await expect(
			actions.login({
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

import { describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';

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
});

import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

function request(password: string) {
	return new Request('http://localhost/api/auth/confirm-sensitive-action', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ password })
	});
}

describe('POST /api/auth/confirm-sensitive-action', () => {
	it('confirms the current user password and reports success without MFA step-up', async () => {
		const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
		const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
			data: { currentLevel: 'aal1', nextLevel: 'aal1' },
			error: null
		});

		const response = await POST({
			request: request('correct-password'),
			locals: {
				user: { email: 'owner@example.com' },
				supabase: {
					auth: {
						signInWithPassword,
						mfa: { getAuthenticatorAssuranceLevel }
					}
				}
			}
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(signInWithPassword).toHaveBeenCalledWith({
			email: 'owner@example.com',
			password: 'correct-password'
		});
	});

	it('returns MFA step-up details when the password is accepted but MFA is required', async () => {
		const response = await POST({
			request: request('correct-password'),
			locals: {
				user: { email: 'owner@example.com' },
				supabase: {
					auth: {
						signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
						mfa: {
							getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
								data: { currentLevel: 'aal1', nextLevel: 'aal2' },
								error: null
							})
						}
					}
				}
			}
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			requiresStepUp: true,
			stepUpPath: '/auth/mfa-verify'
		});
	});

	it('rejects an incorrect password', async () => {
		const response = await POST({
			request: request('wrong-password'),
			locals: {
				user: { email: 'owner@example.com' },
				supabase: {
					auth: {
						signInWithPassword: vi.fn().mockResolvedValue({ error: { message: 'Invalid credentials' } }),
						mfa: { getAuthenticatorAssuranceLevel: vi.fn() }
					}
				}
			}
		} as never);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Password confirmation failed. Try again.' });
	});

	it('returns step-up login details when the user email is unavailable', async () => {
		const signInWithPassword = vi.fn();

		const response = await POST({
			request: request('correct-password'),
			locals: {
				user: null,
				supabase: {
					auth: {
						signInWithPassword,
						mfa: { getAuthenticatorAssuranceLevel: vi.fn() }
					}
				}
			}
		} as never);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Please sign in again before continuing.',
			requiresStepUp: true,
			stepUpPath: '/auth/login'
		});
		expect(signInWithPassword).not.toHaveBeenCalled();
	});

	it('preserves the password-required response for invalid JSON bodies', async () => {
		const signInWithPassword = vi.fn();

		const response = await POST({
			request: new Request('http://localhost/api/auth/confirm-sensitive-action', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: '{'
			}),
			locals: {
				user: { email: 'owner@example.com' },
				supabase: {
					auth: {
						signInWithPassword,
						mfa: { getAuthenticatorAssuranceLevel: vi.fn() }
					}
				}
			}
		} as never);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Password is required.' });
		expect(signInWithPassword).not.toHaveBeenCalled();
	});

	it('wraps unexpected auth adapter exceptions in the standard route error boundary', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(
			POST({
				request: request('correct-password'),
				locals: {
					user: { email: 'owner@example.com' },
					supabase: {
						auth: {
							signInWithPassword: vi.fn().mockRejectedValue(new Error('network unavailable')),
							mfa: { getAuthenticatorAssuranceLevel: vi.fn() }
						}
					}
				}
			} as never)
		).rejects.toMatchObject({ status: 500 });

		expect(consoleError).toHaveBeenCalledWith(
			'[http-adapter] Unhandled route error:',
			expect.stringContaining('name=Error message=network unavailable')
		);
		consoleError.mockRestore();
	});

	it('fails closed when MFA assurance lookup fails after password confirmation', async () => {
		const response = await POST({
			request: request('correct-password'),
			locals: {
				user: { email: 'owner@example.com' },
				supabase: {
					auth: {
						signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
						mfa: {
							getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
								data: null,
								error: { message: 'aal unavailable' }
							})
						}
					}
				}
			}
		} as never);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Could not confirm MFA status. Please sign in again before continuing.'
		});
	});
});

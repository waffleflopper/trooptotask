import { afterEach, describe, expect, it, vi } from 'vitest';
import { actions } from './+page.server';

describe('POST /auth/forgot-password', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('sends recovery emails through the app-owned confirmation route', async () => {
		const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });

		const result = await actions.default({
			request: new Request('http://localhost/auth/forgot-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ email: 'soldier@example.mil' })
			}),
			locals: {
				supabase: {
					auth: {
						resetPasswordForEmail
					}
				}
			},
			url: new URL('http://localhost:4173/auth/forgot-password')
		} as unknown as Parameters<(typeof actions)['default']>[0]);

		expect(result).toEqual({ success: true, email: 'soldier@example.mil' });
		expect(resetPasswordForEmail).toHaveBeenCalledWith('soldier@example.mil', {
			redirectTo: 'http://localhost:4173/auth/confirm?type=recovery&next=%2Fauth%2Freset-password'
		});
	});

	it('uses the configured public app origin for recovery redirects instead of the inbound host', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.org');
		const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });

		await actions.default({
			request: new Request('https://evil.example/auth/forgot-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ email: 'soldier@example.mil' })
			}),
			locals: {
				supabase: {
					auth: {
						resetPasswordForEmail
					}
				}
			},
			url: new URL('https://evil.example/auth/forgot-password')
		} as unknown as Parameters<(typeof actions)['default']>[0]);

		expect(resetPasswordForEmail).toHaveBeenCalledWith('soldier@example.mil', {
			redirectTo: 'https://trooptotask.org/auth/confirm?type=recovery&next=%2Fauth%2Freset-password'
		});
	});
});

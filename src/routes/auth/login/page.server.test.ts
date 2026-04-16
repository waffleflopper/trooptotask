import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

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
			authLinkError:
				'This email link is invalid or has expired. Request a fresh invite or password reset email and try again.'
		});
	});
});

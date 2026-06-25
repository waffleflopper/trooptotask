import { expect, test } from '@playwright/test';
import { buildAuthConfirmRedirectTo, continueFromAuthConfirm, expectAuthConfirmLink } from '../fixtures/auth-confirm';
import { adminClient } from '../fixtures/supabase';

test.describe('Auth email flows', () => {
	test.setTimeout(60_000);

	test('signup confirmation lands on organization setup without creating an organization', async ({ page }) => {
		const email = `signup-${Date.now()}@example.test`;
		const password = 'SignupPassword123';
		let userId: string | null = null;

		try {
			const { data, error } = await adminClient.auth.admin.generateLink({
				type: 'signup',
				email,
				password,
				options: {
					redirectTo: buildAuthConfirmRedirectTo('signup')
				}
			});

			expect(error).toBeNull();
			userId = data.user?.id ?? null;
			expect(userId).toBeTruthy();
			expect(data.properties?.hashed_token).toBeTruthy();

			const signupLink = `${buildAuthConfirmRedirectTo('signup')}&token_hash=${data.properties.hashed_token}`;

			expectAuthConfirmLink(signupLink, 'signup');
			await continueFromAuthConfirm(page, signupLink, 'signup');

			await expect(page.getByRole('heading', { name: 'Create your first Organization' })).toBeVisible();
		} finally {
			if (userId) {
				await adminClient.auth.admin.deleteUser(userId);
			}
		}
	});
});

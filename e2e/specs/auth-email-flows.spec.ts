import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { buildAuthConfirmRedirectTo, continueFromAuthConfirm, expectAuthConfirmLink } from '../fixtures/auth-confirm';
import { adminClient } from '../fixtures/supabase';
import { clearMailbox, extractFirstLink, waitForMessage } from '../fixtures/mailpit';

async function expectPasswordLogin(email: string, password: string, timeoutMs: number = 20000): Promise<void> {
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
	const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY || '';

	const deadline = Date.now() + timeoutMs;
	let lastError: string | null = null;

	while (Date.now() < deadline) {
		const client = createClient(supabaseUrl, anonKey, {
			auth: { persistSession: false, autoRefreshToken: false }
		});

		const { data, error } = await client.auth.signInWithPassword({ email, password });
		if (!error && data.session) {
			await client.auth.signOut();
			return;
		}

		lastError = error?.message ?? 'No session returned';
		await new Promise((resolve) => setTimeout(resolve, 250));
	}

	throw new Error(`Timed out waiting for password login for ${email}: ${lastError ?? 'unknown error'}`);
}

test.describe('Auth email flows', () => {
	test.setTimeout(60_000);

	test('invite email lands on accept-invite and produces a usable password login', async ({ page }) => {
		const email = `invite-${Date.now()}@example.test`;
		const password = 'InvitePassword123';
		let userId: string | null = null;

		try {
			await clearMailbox();

			const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
				redirectTo: buildAuthConfirmRedirectTo('invite')
			});

			expect(error).toBeNull();
			userId = data.user?.id ?? null;

			const inviteEmail = await waitForMessage(email, ['invited', 'trooptotask invite is ready']);
			const inviteLink = extractFirstLink(inviteEmail);

			expectAuthConfirmLink(inviteLink, 'invite');
			await continueFromAuthConfirm(page, inviteLink, 'invite');

			await page.locator('input#password').fill(password);
			await page.locator('input#confirmPassword').fill(password);
			await page.getByRole('button', { name: 'Set Password' }).click();

			await expectPasswordLogin(email, password);
		} finally {
			if (userId) {
				await adminClient.auth.admin.deleteUser(userId);
			}
			await clearMailbox();
		}
	});

	test('password recovery email lands on reset-password and accepts the same password policy', async ({ page }) => {
		const email = `recovery-${Date.now()}@example.test`;
		const originalPassword = 'OriginalPassword123';
		const newPassword = 'RecoveredPassword123';
		let userId: string | null = null;

		try {
			await clearMailbox();

			const { data, error } = await adminClient.auth.admin.createUser({
				email,
				password: originalPassword,
				email_confirm: true
			});

			expect(error).toBeNull();
			userId = data.user.id;

			await page.goto('/auth/forgot-password');
			await page.getByLabel('Email Address').fill(email);
			await page.getByRole('button', { name: 'Send Reset Link' }).click();

			const recoveryEmail = await waitForMessage(email, 'reset');
			const recoveryLink = extractFirstLink(recoveryEmail);

			expectAuthConfirmLink(recoveryLink, 'recovery');
			await continueFromAuthConfirm(page, recoveryLink, 'recovery');

			await page.locator('input#password').fill(newPassword);
			await page.locator('input#confirmPassword').fill(newPassword);
			await page.getByRole('button', { name: 'Update Password' }).click();

			await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();

			await expectPasswordLogin(email, newPassword);
		} finally {
			if (userId) {
				await adminClient.auth.admin.deleteUser(userId);
			}
			await clearMailbox();
		}
	});

	test('invite acceptance stays on the page and shows an error when finalization fails', async ({ page }) => {
		const email = `invite-finalize-fail-${Date.now()}@example.test`;
		const password = 'InvitePassword123';
		let userId: string | null = null;

		try {
			await clearMailbox();

			const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
				redirectTo: buildAuthConfirmRedirectTo('invite')
			});

			expect(error).toBeNull();
			userId = data.user?.id ?? null;

			const inviteEmail = await waitForMessage(email, ['invited', 'trooptotask invite is ready']);
			const inviteLink = extractFirstLink(inviteEmail);

			await page.route('**/api/auth/finalize-invite', async (route) => {
				await route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({
						error:
							'Your password was set, but we could not finish connecting your account. Please try the invite link again or contact support.'
					})
				});
			});

			expectAuthConfirmLink(inviteLink, 'invite');
			await continueFromAuthConfirm(page, inviteLink, 'invite');

			await page.locator('input#password').fill(password);
			await page.locator('input#confirmPassword').fill(password);
			await page.getByRole('button', { name: 'Set Password' }).click();

			await expect(
				page.getByText(
					'Your password was set, but we could not finish connecting your account. Please try the invite link again or contact support.'
				)
			).toBeVisible();
			await expect(page).toHaveURL(/\/auth\/accept-invite/);
			await expect(page.getByRole('heading', { name: 'Account activated' })).toHaveCount(0);
		} finally {
			if (userId) {
				await adminClient.auth.admin.deleteUser(userId);
			}
			await clearMailbox();
		}
	});
});

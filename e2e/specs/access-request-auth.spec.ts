import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { appBaseUrl, appHost } from '../fixtures/app';
import { adminClient } from '../fixtures/supabase';
import { clearMailbox, extractFirstLink, waitForMessage } from '../fixtures/mailpit';

async function createAuthenticatedContext(
	browser: import('@playwright/test').Browser,
	email: string,
	password: string
): Promise<import('@playwright/test').BrowserContext> {
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
	const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY || '';
	const client = createClient(supabaseUrl, anonKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});

	const { data, error } = await client.auth.signInWithPassword({ email, password });
	expect(error).toBeNull();
	expect(data.session).not.toBeNull();

	const url = new URL(supabaseUrl);
	const ref = url.hostname.split('.')[0];
	const cookieName = `sb-${ref}-auth-token`;
	const sessionStr = JSON.stringify({
		access_token: data.session!.access_token,
		refresh_token: data.session!.refresh_token,
		expires_at: data.session!.expires_at,
		expires_in: data.session!.expires_in,
		token_type: data.session!.token_type,
		user: data.session!.user
	});

	return browser.newContext({
		storageState: {
			cookies: [
				{
					name: cookieName,
					value: `base64-${Buffer.from(sessionStr).toString('base64url')}`,
					domain: appHost,
					path: '/',
					httpOnly: false,
					secure: false,
					sameSite: 'Lax',
					expires: data.session!.expires_at || -1
				}
			],
			origins: []
		}
	});
}

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

test.describe('Access request auth hardening', () => {
	test('approved requests stay resendable until invite acceptance is completed', async ({ browser }) => {
		const adminEmail = `platform-admin-${Date.now()}@example.test`;
		const requesterEmail = `requester-invite-${Date.now()}@example.test`;
		const adminPassword = 'PlatformAdmin123';
		const requesterPassword = 'InviteAccess123';
		let adminUserId: string | null = null;
		let requesterUserId: string | null = null;

		try {
			await clearMailbox();

			const { data: adminUserData, error: adminUserError } = await adminClient.auth.admin.createUser({
				email: adminEmail,
				password: adminPassword,
				email_confirm: true
			});
			expect(adminUserError).toBeNull();
			adminUserId = adminUserData.user.id;

			const { error: platformAdminError } = await adminClient.from('platform_admins').insert({
				user_id: adminUserId,
				role: 'support',
				is_active: true
			});
			expect(platformAdminError).toBeNull();

			const { error: accessRequestError } = await adminClient.from('access_requests').insert({
				email: requesterEmail.toLowerCase(),
				name: 'Access Request Invite',
				reason: 'Regression test for invite acceptance.'
			});
			expect(accessRequestError).toBeNull();

			const adminContext = await createAuthenticatedContext(browser, adminEmail, adminPassword);
			const adminPage = await adminContext.newPage();
			await adminPage.goto('/admin/access-requests');

			const pendingCard = adminPage.locator('.request-card').filter({ hasText: requesterEmail });
			await expect(pendingCard).toBeVisible();
			await pendingCard.getByRole('button', { name: 'Approve' }).click();

			await adminPage.getByRole('button', { name: /^Reviewed/ }).click();
			const reviewedCard = adminPage.locator('.request-card').filter({ hasText: requesterEmail });
			await expect(reviewedCard).toBeVisible();
			await expect(reviewedCard.getByRole('button', { name: 'Resend Invite' })).toBeVisible();

			const inviteEmail = await waitForMessage(requesterEmail, 'invited');
			const inviteLink = extractFirstLink(inviteEmail);
			expect(decodeURIComponent(inviteLink)).toContain(`redirect_to=${appBaseUrl}/auth/accept-invite`);

			const requesterContext = await browser.newContext();
			const requesterPage = await requesterContext.newPage();
			await requesterPage.goto(inviteLink);
			await requesterPage.locator('input#password').fill(requesterPassword);
			await requesterPage.locator('input#confirmPassword').fill(requesterPassword);
			await requesterPage.getByRole('button', { name: 'Set Password' }).click();

			await expectPasswordLogin(requesterEmail, requesterPassword);
			await requesterContext.close();

			const { data: requesterUser } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
			requesterUserId =
				requesterUser.users.find((user) => user.email?.toLowerCase() === requesterEmail.toLowerCase())?.id ?? null;

			await adminPage.reload();
			await adminPage.getByRole('button', { name: /^Reviewed/ }).click();
			await expect(reviewedCard.getByRole('button', { name: 'Resend Invite' })).toHaveCount(0);
			await expect(reviewedCard.getByText('Account setup completed')).toBeVisible();

			await adminContext.close();
		} finally {
			await clearMailbox();
			await adminClient.from('registration_invites').delete().eq('email', requesterEmail);
			await adminClient.from('access_requests').delete().eq('email', requesterEmail);
			if (adminUserId) {
				await adminClient.from('platform_admins').delete().eq('user_id', adminUserId);
			}
			if (requesterUserId) {
				await adminClient.auth.admin.deleteUser(requesterUserId);
			}
			if (adminUserId) {
				await adminClient.auth.admin.deleteUser(adminUserId);
			}
		}
	});

	test('resend sends a usable setup email when Supabase already created the auth user', async ({ browser }) => {
		const adminEmail = `platform-admin-${Date.now()}-b@example.test`;
		const requesterEmail = `requester-recovery-${Date.now()}@example.test`;
		const adminPassword = 'PlatformAdmin123';
		const requesterPassword = 'RecoveryAccess123';
		let adminUserId: string | null = null;
		let requesterUserId: string | null = null;

		try {
			await clearMailbox();

			const { data: adminUserData, error: adminUserError } = await adminClient.auth.admin.createUser({
				email: adminEmail,
				password: adminPassword,
				email_confirm: true
			});
			expect(adminUserError).toBeNull();
			adminUserId = adminUserData.user.id;

			const { error: platformAdminError } = await adminClient.from('platform_admins').insert({
				user_id: adminUserId,
				role: 'support',
				is_active: true
			});
			expect(platformAdminError).toBeNull();

			const { error: accessRequestError } = await adminClient.from('access_requests').insert({
				email: requesterEmail.toLowerCase(),
				name: 'Access Request Recovery',
				reason: 'Regression test for resend recovery fallback.'
			});
			expect(accessRequestError).toBeNull();

			const adminContext = await createAuthenticatedContext(browser, adminEmail, adminPassword);
			const adminPage = await adminContext.newPage();
			await adminPage.goto('/admin/access-requests');

			const pendingCard = adminPage.locator('.request-card').filter({ hasText: requesterEmail });
			await pendingCard.getByRole('button', { name: 'Approve' }).click();

			const invitedUsers = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
			requesterUserId =
				invitedUsers.data.users.find((user) => user.email?.toLowerCase() === requesterEmail.toLowerCase())?.id ?? null;

			await clearMailbox();

			await adminPage.getByRole('button', { name: /^Reviewed/ }).click();
			const reviewedCard = adminPage.locator('.request-card').filter({ hasText: requesterEmail });
			await reviewedCard.getByRole('button', { name: 'Resend Invite' }).click();
			await expect(adminPage.locator('.admin-alert--error')).toHaveCount(0);

			const setupEmail = await waitForMessage(requesterEmail, ['reset', 'invited']);
			const setupLink = extractFirstLink(setupEmail);
			const isRecoveryEmail = setupEmail.Subject.toLowerCase().includes('reset');

			const requesterContext = await browser.newContext();
			const requesterPage = await requesterContext.newPage();
			await requesterPage.goto(setupLink);
			await requesterPage.locator('input#password').fill(requesterPassword);
			await requesterPage.locator('input#confirmPassword').fill(requesterPassword);
			await requesterPage.getByRole('button', { name: isRecoveryEmail ? 'Update Password' : 'Set Password' }).click();

			if (isRecoveryEmail) {
				expect(decodeURIComponent(setupLink)).toContain(`redirect_to=${appBaseUrl}/auth/reset-password`);
				await expect(requesterPage.getByRole('heading', { name: 'Password updated' })).toBeVisible();
			} else {
				expect(decodeURIComponent(setupLink)).toContain(`redirect_to=${appBaseUrl}/auth/accept-invite`);
			}

			await expectPasswordLogin(requesterEmail, requesterPassword);
			await requesterContext.close();

			await adminPage.reload();
			await adminPage.getByRole('button', { name: /^Reviewed/ }).click();
			await expect(reviewedCard.getByRole('button', { name: 'Resend Invite' })).toHaveCount(0);
			await expect(reviewedCard.getByText('Account setup completed')).toBeVisible();

			await adminContext.close();
		} finally {
			await clearMailbox();
			await adminClient.from('registration_invites').delete().eq('email', requesterEmail);
			await adminClient.from('access_requests').delete().eq('email', requesterEmail);
			if (adminUserId) {
				await adminClient.from('platform_admins').delete().eq('user_id', adminUserId);
			}
			if (requesterUserId) {
				await adminClient.auth.admin.deleteUser(requesterUserId);
			}
			if (adminUserId) {
				await adminClient.auth.admin.deleteUser(adminUserId);
			}
		}
	});
});

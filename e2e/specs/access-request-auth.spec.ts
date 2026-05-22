import { createHash, randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { appBaseUrl, appHost } from '../fixtures/app';
import { adminClient } from '../fixtures/supabase';
import { clearMailbox, extractFirstLink, waitForMessage } from '../fixtures/mailpit';

const SETUP_EMAIL_SUBJECT = 'Set up your TroopToTask account';
const E2E_REASON = 'Account Setup Link E2E regression.';

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

async function deleteAuthUserByEmail(email: string): Promise<void> {
	const users = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
	const user = users.data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
	if (user) {
		await adminClient.auth.admin.deleteUser(user.id);
	}
}

async function createPlatformAdmin(browser: import('@playwright/test').Browser, suffix: string) {
	const email = `platform-admin-${Date.now()}-${suffix}@example.test`;
	const password = 'PlatformAdmin123';
	const { data, error } = await adminClient.auth.admin.createUser({
		email,
		password,
		email_confirm: true
	});
	expect(error).toBeNull();
	const userId = data.user.id;

	const { error: platformAdminError } = await adminClient.from('platform_admins').insert({
		user_id: userId,
		role: 'support',
		is_active: true
	});
	expect(platformAdminError).toBeNull();

	const context = await createAuthenticatedContext(browser, email, password);
	return { context, email, password, userId };
}

async function cleanupEmail(email: string): Promise<void> {
	const { data: requests, error } = await adminClient
		.from('access_requests')
		.select('id')
		.in('email', [email.toLowerCase(), email]);
	expect(error).toBeNull();
	const requestIds = (requests ?? []).map((request) => request.id as string);
	if (requestIds.length > 0) {
		await adminClient.from('auth_email_outbox').delete().in('access_request_id', requestIds);
		await adminClient.from('account_setup_links').delete().in('access_request_id', requestIds);
		await adminClient.from('access_requests').delete().in('id', requestIds);
	}
	await deleteAuthUserByEmail(email);
}

async function cleanupPlatformAdmin(userId: string | null): Promise<void> {
	if (!userId) return;
	await adminClient.from('platform_admins').delete().eq('user_id', userId);
	await adminClient.auth.admin.deleteUser(userId);
}

async function cleanupAccountSetupE2ERows(): Promise<void> {
	const { data: requests, error } = await adminClient
		.from('access_requests')
		.select('id, email')
		.eq('reason', E2E_REASON);
	expect(error).toBeNull();

	const requestIds = (requests ?? []).map((request) => request.id as string);
	const emails = (requests ?? []).map((request) => request.email as string);
	if (requestIds.length > 0) {
		await adminClient.from('auth_email_outbox').delete().in('access_request_id', requestIds);
		await adminClient.from('account_setup_links').delete().in('access_request_id', requestIds);
		await adminClient.from('access_requests').delete().in('id', requestIds);
	}

	const users = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
	const e2eUsers = users.data.users.filter((user) => {
		const email = user.email?.toLowerCase() ?? '';
		return (
			/^platform-admin-\d+-setup-/.test(email) ||
			email.startsWith('setup-') ||
			emails.some((requestEmail) => requestEmail.toLowerCase() === email)
		);
	});

	for (const user of e2eUsers) {
		await adminClient.from('platform_admins').delete().eq('user_id', user.id);
		await adminClient.auth.admin.deleteUser(user.id);
	}
}

async function insertAccessRequest(input: { email: string; status?: 'pending' | 'approved'; name?: string }) {
	const { data, error } = await adminClient
		.from('access_requests')
		.insert({
			email: input.email.toLowerCase(),
			name: input.name ?? 'Account Setup Tester',
			reason: E2E_REASON,
			status: input.status ?? 'pending',
			reviewed_at: input.status === 'approved' ? new Date().toISOString() : null
		})
		.select('id')
		.single();
	expect(error).toBeNull();
	return data.id as string;
}

function createRawSetupToken(): string {
	return randomBytes(32).toString('base64url');
}

function hashSetupToken(rawToken: string): string {
	return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

async function insertSetupLink(accessRequestId: string, rawToken: string = createRawSetupToken()) {
	const createdAt = new Date();
	const expiresAt = new Date(createdAt.getTime() + 14 * 24 * 60 * 60 * 1000);
	const { data, error } = await adminClient
		.from('account_setup_links')
		.insert({
			access_request_id: accessRequestId,
			token_hash: hashSetupToken(rawToken),
			expires_at: expiresAt.toISOString(),
			created_at: createdAt.toISOString(),
			claimed_at: null,
			failed_at: null,
			failure_reason: null,
			used_at: null,
			revoked_at: null,
			revocation_reason: null
		})
		.select('id')
		.single();
	expect(error).toBeNull();
	return {
		id: data.id as string,
		rawToken,
		setupUrl: `${appBaseUrl}/auth/setup-account?token=${encodeURIComponent(rawToken)}`
	};
}

async function latestSetupLinks(accessRequestId: string) {
	const { data, error } = await adminClient
		.from('account_setup_links')
		.select('id, claimed_at, failed_at, failure_reason, used_at, revoked_at, revocation_reason, created_at')
		.eq('access_request_id', accessRequestId)
		.order('created_at', { ascending: false });
	expect(error).toBeNull();
	return data ?? [];
}

async function outboxRows(accessRequestId: string) {
	const { data, error } = await adminClient
		.from('auth_email_outbox')
		.select('id, setup_link_id, status, attempt_count, last_error, sent_at, created_at')
		.eq('access_request_id', accessRequestId)
		.order('created_at', { ascending: false });
	expect(error).toBeNull();
	return data ?? [];
}

async function submitSetupForm(page: import('@playwright/test').Page, password: string): Promise<void> {
	await page.locator('input#password').fill(password);
	await page.locator('input#confirmPassword').fill(password);
	await page.getByRole('button', { name: 'Set Up Account' }).click();
}

async function findReviewedCard(page: import('@playwright/test').Page, email: string) {
	const reviewedCard = page.locator('article, .request-card, [data-slot="card"]').filter({ hasText: email });
	await expect(reviewedCard).toHaveCount(1);
	return reviewedCard;
}

async function revealCardForInteraction(card: import('@playwright/test').Locator): Promise<void> {
	await card.evaluate((node) => {
		let current: HTMLElement | null = node instanceof HTMLElement ? node : null;
		while (current && current.getAttribute('role') !== 'tabpanel') {
			current = current.parentElement;
		}
		if (!current) throw new Error('Reviewed tab panel was not found');
		current.hidden = false;
		current.removeAttribute('hidden');
		current.style.display = 'grid';
		current.setAttribute('data-state', 'active');
	});
}

async function clickFreshSetupAction(card: import('@playwright/test').Locator): Promise<void> {
	await revealCardForInteraction(card);
	await card.getByRole('button', { name: 'Send Fresh Setup' }).click();
}

async function submitFreshSetupAction(page: import('@playwright/test').Page, requestId: string): Promise<void> {
	const response = await page.request.post(`${appBaseUrl}/admin/access-requests?/resend`, {
		form: { requestId },
		maxRedirects: 0
	});
	expect([200, 303]).toContain(response.status());
}

function isAuthenticatedAppUrl(url: string): boolean {
	return /\/(dashboard|org\/new)(?:$|[?#])/.test(new URL(url).pathname);
}

test.describe('Account Setup Link E2E hardening', () => {
	test.setTimeout(90_000);

	test.beforeEach(async () => {
		await cleanupAccountSetupE2ERows();
	});

	test.afterEach(async () => {
		await cleanupAccountSetupE2ERows();
	});

	test('approves an Access Request, delivers an official-origin setup email, exchanges the token, and signs in', async ({
		browser
	}) => {
		const requesterEmail = `setup-happy-${Date.now()}@example.test`;
		const requesterPassword = 'HappySetup123';
		let adminUserId: string | null = null;

		try {
			await clearMailbox();
			const admin = await createPlatformAdmin(browser, 'setup-happy');
			adminUserId = admin.userId;
			const requestId = await insertAccessRequest({ email: requesterEmail });

			const adminPage = await admin.context.newPage();
			await adminPage.goto('/admin/access-requests');
			const pendingCard = adminPage
				.locator('article, .request-card, [data-slot="card"]')
				.filter({ hasText: requesterEmail });
			await pendingCard.getByRole('button', { name: 'Approve' }).click();

			const setupEmail = await waitForMessage(requesterEmail, SETUP_EMAIL_SUBJECT);
			const setupLink = extractFirstLink(setupEmail);
			const setupUrl = new URL(setupLink);
			expect(setupUrl.origin).toBe(appBaseUrl);
			expect(setupUrl.pathname).toBe('/auth/setup-account');
			expect(setupUrl.searchParams.get('token')).toBeTruthy();

			const requesterContext = await browser.newContext();
			const requesterPage = await requesterContext.newPage();
			await requesterPage.goto(setupLink);
			await expect(requesterPage).toHaveURL(`${appBaseUrl}/auth/setup-account`);
			await expect(requesterPage.locator('input[name="token"]')).toHaveCount(0);
			await expect(requesterPage.getByText(`This setup link is approved for ${requesterEmail}.`)).toBeVisible();

			let setupPostBody = '';
			await requesterPage.route('**/auth/setup-account**', async (route) => {
				if (route.request().method() === 'POST') {
					setupPostBody = route.request().postData() ?? '';
				}
				await route.continue();
			});

			await submitSetupForm(requesterPage, requesterPassword);
			await expect
				.poll(() => isAuthenticatedAppUrl(requesterPage.url()), {
					message: 'setup should land in the authenticated app'
				})
				.toBe(true);
			expect(setupPostBody).toContain('password=');
			expect(setupPostBody).not.toContain('token=');
			await expectPasswordLogin(requesterEmail, requesterPassword);

			const links = await latestSetupLinks(requestId);
			expect(links).toHaveLength(1);
			expect(links[0].used_at).toBeTruthy();
			expect(links[0].failed_at).toBeNull();

			await requesterContext.close();
			await admin.context.close();
		} finally {
			await clearMailbox();
			await cleanupEmail(requesterEmail);
			await cleanupPlatformAdmin(adminUserId);
		}
	});

	test('resending setup replaces older unused links and only the newest link can complete', async ({ browser }) => {
		const requesterEmail = `setup-newest-${Date.now()}@example.test`;
		const requesterPassword = 'NewestSetup123';
		let adminUserId: string | null = null;

		try {
			await clearMailbox();
			const admin = await createPlatformAdmin(browser, 'setup-newest');
			adminUserId = admin.userId;
			const requestId = await insertAccessRequest({ email: requesterEmail });

			const adminPage = await admin.context.newPage();
			await adminPage.goto('/admin/access-requests');
			const pendingCard = adminPage
				.locator('article, .request-card, [data-slot="card"]')
				.filter({ hasText: requesterEmail });
			await pendingCard.getByRole('button', { name: 'Approve' }).click();
			const firstEmail = await waitForMessage(requesterEmail, SETUP_EMAIL_SUBJECT);
			const firstLink = extractFirstLink(firstEmail);

			await clearMailbox();
			const reviewedCard = await findReviewedCard(adminPage, requesterEmail);
			await expect(reviewedCard).toContainText('Send Fresh Setup');
			await clickFreshSetupAction(reviewedCard);
			const secondEmail = await waitForMessage(requesterEmail, SETUP_EMAIL_SUBJECT);
			const secondLink = extractFirstLink(secondEmail);
			expect(secondLink).not.toBe(firstLink);

			const staleContext = await browser.newContext();
			const stalePage = await staleContext.newPage();
			await stalePage.goto(firstLink);
			await expect(stalePage.getByText('This Account Setup Link was replaced.')).toBeVisible();
			await staleContext.close();

			const requesterContext = await browser.newContext();
			const requesterPage = await requesterContext.newPage();
			await requesterPage.goto(secondLink);
			await expect(requesterPage).toHaveURL(`${appBaseUrl}/auth/setup-account`);
			await submitSetupForm(requesterPage, requesterPassword);
			await expect
				.poll(() => isAuthenticatedAppUrl(requesterPage.url()), {
					message: 'setup should land in the authenticated app'
				})
				.toBe(true);
			await expectPasswordLogin(requesterEmail, requesterPassword);

			const links = await latestSetupLinks(requestId);
			expect(links).toHaveLength(2);
			expect(links[0].used_at).toBeTruthy();
			expect(links[1].revocation_reason).toBe('replaced');

			await requesterContext.close();
			await admin.context.close();
		} finally {
			await clearMailbox();
			await cleanupEmail(requesterEmail);
			await cleanupPlatformAdmin(adminUserId);
		}
	});

	test('two setup sessions racing the same link produce one completed User Account setup', async ({ browser }) => {
		const requesterEmail = `setup-race-${Date.now()}@example.test`;
		const requesterPassword = 'RaceSetup1234';

		try {
			await cleanupEmail(requesterEmail);
			const requestId = await insertAccessRequest({ email: requesterEmail, status: 'approved' });
			const setupLink = await insertSetupLink(requestId);

			const firstContext = await browser.newContext();
			const secondContext = await browser.newContext();
			const firstPage = await firstContext.newPage();
			const secondPage = await secondContext.newPage();
			await Promise.all([firstPage.goto(setupLink.setupUrl), secondPage.goto(setupLink.setupUrl)]);
			await expect(firstPage).toHaveURL(`${appBaseUrl}/auth/setup-account`);
			await expect(secondPage).toHaveURL(`${appBaseUrl}/auth/setup-account`);
			await firstPage.locator('input#password').fill(requesterPassword);
			await firstPage.locator('input#confirmPassword').fill(requesterPassword);
			await secondPage.locator('input#password').fill(requesterPassword);
			await secondPage.locator('input#confirmPassword').fill(requesterPassword);

			await Promise.allSettled([
				firstPage.getByRole('button', { name: 'Set Up Account' }).click(),
				secondPage.getByRole('button', { name: 'Set Up Account' }).click()
			]);

			await expectPasswordLogin(requesterEmail, requesterPassword);
			const links = await latestSetupLinks(requestId);
			expect(links).toHaveLength(1);
			expect(links[0].used_at).toBeTruthy();
			expect(links[0].failed_at).toBeNull();

			const users = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
			const matchingUsers = users.data.users.filter(
				(user) => user.email?.toLowerCase() === requesterEmail.toLowerCase()
			);
			expect(matchingUsers).toHaveLength(1);

			await expect
				.poll(() => isAuthenticatedAppUrl(firstPage.url()) || isAuthenticatedAppUrl(secondPage.url()), {
					message: 'one setup session should win and reach the authenticated app'
				})
				.toBe(true);
			const firstWon = isAuthenticatedAppUrl(firstPage.url());
			const secondWon = isAuthenticatedAppUrl(secondPage.url());
			expect(Number(firstWon) + Number(secondWon)).toBe(1);
			const losingPage = firstWon ? secondPage : firstPage;
			await expect(losingPage.getByText(/already being used|already been used|no longer works/i)).toBeVisible();

			await firstContext.close();
			await secondContext.close();
		} finally {
			await cleanupEmail(requesterEmail);
		}
	});

	test('failed delivery and failed-after-claim states remain supportable without re-approving', async ({ browser }) => {
		const deliveryEmail = `setup-delivery-fail-${Date.now()}@example.test`;
		const failureEmail = `not-an-email-${Date.now()}`;
		let adminUserId: string | null = null;

		try {
			await clearMailbox();
			const admin = await createPlatformAdmin(browser, 'setup-support');
			adminUserId = admin.userId;
			const deliveryRequestId = await insertAccessRequest({ email: deliveryEmail, status: 'approved' });
			const deliveryLink = await insertSetupLink(deliveryRequestId);
			const { error: outboxInsertError } = await adminClient.from('auth_email_outbox').insert({
				access_request_id: deliveryRequestId,
				setup_link_id: deliveryLink.id,
				recipient: deliveryEmail,
				purpose: 'account_setup',
				status: 'failed',
				attempt_count: 1,
				last_error: 'Local delivery failed',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				sent_at: null
			});
			expect(outboxInsertError).toBeNull();

			const failureRequestId = await insertAccessRequest({
				email: failureEmail,
				status: 'approved',
				name: 'Broken Setup Email'
			});
			const failingSetupLink = await insertSetupLink(failureRequestId);

			const failingContext = await browser.newContext();
			const failingPage = await failingContext.newPage();
			await failingPage.goto(failingSetupLink.setupUrl);
			await submitSetupForm(failingPage, 'FailureSetup123');
			await expect(failingPage.getByText('We could not finish account setup after claiming this link.')).toBeVisible();

			const failedLinks = await latestSetupLinks(failureRequestId);
			expect(failedLinks[0].failed_at).toBeTruthy();
			expect(failedLinks[0].failure_reason).toBe('account-create-failed');
			await failingPage.goto(failingSetupLink.setupUrl);
			await expect(failingPage.getByText('This Account Setup Link could not finish setup.')).toBeVisible();
			await failingContext.close();

			const adminPage = await admin.context.newPage();
			await adminPage.goto('/admin/access-requests');
			const deliveryCard = await findReviewedCard(adminPage, deliveryEmail);
			await expect(deliveryCard).toContainText('Setup Delivery failed');
			await expect(deliveryCard).toContainText('Delivery error: Local delivery failed');
			await expect(deliveryCard).toContainText('Send Fresh Setup');
			await submitFreshSetupAction(adminPage, deliveryRequestId);
			const retryEmail = await waitForMessage(deliveryEmail, SETUP_EMAIL_SUBJECT);
			expect(new URL(extractFirstLink(retryEmail)).origin).toBe(appBaseUrl);

			const deliveryOutboxRows = await outboxRows(deliveryRequestId);
			expect(deliveryOutboxRows.some((row) => row.status === 'failed')).toBe(true);
			expect(deliveryOutboxRows.some((row) => row.status === 'sent')).toBe(true);
			const { data: deliveryRequest } = await adminClient
				.from('access_requests')
				.select('status')
				.eq('id', deliveryRequestId)
				.single();
			expect(deliveryRequest?.status).toBe('approved');

			const failureCard = adminPage
				.locator('article, .request-card, [data-slot="card"]')
				.filter({ hasText: failureEmail });
			await expect(failureCard).toContainText('Setup Failed');
			await expect(failureCard).toContainText('Send Fresh Setup');

			await admin.context.close();
		} finally {
			await clearMailbox();
			await cleanupEmail(deliveryEmail);
			await cleanupEmail(failureEmail);
			await cleanupPlatformAdmin(adminUserId);
		}
	});
});

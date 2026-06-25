import { createHash, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { appBaseUrl, appHost } from '../fixtures/app';
import { adminClient } from '../fixtures/supabase';
import { continueFromAuthConfirm, expectAuthConfirmLink } from '../fixtures/auth-confirm';
import { clearMailbox, extractFirstLink, waitForMessage } from '../fixtures/mailpit';

interface AuthUserSummary {
	id: string;
	email?: string | null;
}

interface OrganizationSummary {
	id: string;
	name: string;
	url_slug: string | null;
}

const SIGNUP_CONFIRMATION_SUBJECTS = ['confirm', 'confirmation', 'signup'];

function hashRateLimitDimension(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function isSignupConfirmationEmailTimeout(error: unknown, email: string): boolean {
	const expectedMessage = `Timed out waiting for "${SIGNUP_CONFIRMATION_SUBJECTS.join(', ')}" email for ${email}`;
	return error instanceof Error && error.message === expectedMessage;
}

async function listAuthUsers(): Promise<AuthUserSummary[]> {
	const users: AuthUserSummary[] = [];
	for (let page = 1; page <= 5; page += 1) {
		const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
		expect(error).toBeNull();
		users.push(...(data.users as AuthUserSummary[]));
		if (data.users.length < 1000) break;
	}
	return users;
}

async function findAuthUserByEmail(email: string): Promise<AuthUserSummary | null> {
	const normalizedEmail = email.toLowerCase();
	const users = await listAuthUsers();
	return users.find((user) => user.email?.toLowerCase() === normalizedEmail) ?? null;
}

async function waitForAuthUser(email: string, timeoutMs: number = 20_000): Promise<AuthUserSummary> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const user = await findAuthUserByEmail(email);
		if (user) return user;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Timed out waiting for auth user ${email}`);
}

async function waitForOwnedOrganization(input: {
	userId: string;
	name: string;
	timeoutMs?: number;
}): Promise<OrganizationSummary> {
	const deadline = Date.now() + (input.timeoutMs ?? 20_000);
	while (Date.now() < deadline) {
		const { data, error } = await adminClient
			.from('organizations')
			.select('id, name, url_slug')
			.eq('created_by', input.userId)
			.eq('name', input.name)
			.maybeSingle();
		expect(error).toBeNull();
		if (data) return data as OrganizationSummary;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Timed out waiting for organization "${input.name}" owned by ${input.userId}`);
}

async function cleanupOrganization(orgId: string): Promise<void> {
	const orgScopedTables = [
		'organization_checkout_attempts',
		'organization_billing_snapshots',
		'special_days',
		'assignment_types',
		'status_types',
		'training_types',
		'organization_memberships',
		'groups',
		'notifications'
	];

	for (const table of orgScopedTables) {
		const { error } = await adminClient.from(table).delete().eq('organization_id', orgId);
		expect(error, `cleanup ${table}`).toBeNull();
	}

	const { error: auditError } = await adminClient.from('audit_logs').delete().eq('org_id', orgId);
	expect(auditError, 'cleanup audit_logs').toBeNull();

	const { error } = await adminClient.from('organizations').delete().eq('id', orgId);
	expect(error, 'cleanup organizations').toBeNull();
}

async function cleanupSignupRateLimitBuckets(email: string): Promise<void> {
	const bucketKeys = [`signup:email:${hashRateLimitDimension(email.toLowerCase())}`];
	const loopbackAddresses =
		appHost === '127.0.0.1' || appHost === 'localhost' || appHost === '::1'
			? ['127.0.0.1', '::1', '::ffff:127.0.0.1']
			: [];

	for (const address of loopbackAddresses) {
		bucketKeys.push(`signup:ip:${hashRateLimitDimension(address)}`);
	}

	for (const bucketKey of bucketKeys) {
		const response = await adminClient.from('durable_rate_limits').delete().eq('bucket_key', bucketKey);
		expect(response.error, `cleanup durable_rate_limits bucket ${bucketKey}`).toBeNull();
		expect(response.status, `cleanup durable_rate_limits bucket ${bucketKey}`).toBeGreaterThanOrEqual(200);
		expect(response.status, `cleanup durable_rate_limits bucket ${bucketKey}`).toBeLessThan(300);
	}
}

async function cleanupSelfServiceRun(input: {
	email: string;
	userId: string | null;
	orgId: string | null;
}): Promise<void> {
	if (input.orgId) {
		await cleanupOrganization(input.orgId);
	}

	if (input.userId) {
		const { error } = await adminClient.auth.admin.deleteUser(input.userId);
		expect(error, 'cleanup auth user').toBeNull();
	}

	await cleanupSignupRateLimitBuckets(input.email);
	await clearMailbox();
}

async function continueFromLocalConfirmedSignup(page: Page, email: string, password: string): Promise<string> {
	await page.goto('/org/new');
	if (new URL(page.url()).pathname === '/org/new') return 'local-dev-session';

	await page.goto(`/auth/login?next=${encodeURIComponent('/org/new')}`);
	await page.getByTestId('login-email').fill(email);
	await page.getByTestId('login-password').fill(password);
	await page.getByTestId('login-submit').click();
	await expect(page).toHaveURL(/\/(org\/new|dashboard|org\/)/, { timeout: 20_000 });

	if (new URL(page.url()).pathname !== '/org/new') {
		await page.goto('/org/new');
	}

	return 'local-dev-login';
}

async function continueFromSignupEmailOrLocalLogin(page: Page, email: string, password: string): Promise<string> {
	let message: Awaited<ReturnType<typeof waitForMessage>>;
	try {
		message = await waitForMessage(email, SIGNUP_CONFIRMATION_SUBJECTS, 4_000);
	} catch (error) {
		if (!isSignupConfirmationEmailTimeout(error, email)) {
			throw error;
		}

		return continueFromLocalConfirmedSignup(page, email, password);
	}

	const confirmationLink = extractFirstLink(message);

	expectAuthConfirmLink(confirmationLink, 'email');
	await continueFromAuthConfirm(page, confirmationLink, 'email');
	return 'email-confirmation';
}

test.describe('Self-service acquisition', () => {
	test.setTimeout(90_000);

	test('creates a public account, first organization, and reaches billing checkout entry', async ({ page }) => {
		const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const email = `self-service-${suffix}@example.test`;
		const password = 'SelfServicePass123';
		const orgName = `Self Service E2E ${suffix}`;
		let userId: string | null = null;
		let orgId: string | null = null;

		try {
			await clearMailbox();
			await cleanupSignupRateLimitBuckets(email);

			await page.goto('/auth/sign-up');
			await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();

			await page.getByTestId('signup-email').fill(email);
			await page.getByTestId('signup-password').fill(password);
			await page.getByTestId('signup-confirm-password').fill(password);
			await page.getByTestId('signup-submit').click();

			await expect(page.getByText('Confirmation email sent')).toBeVisible();
			userId = (await waitForAuthUser(email)).id;

			const confirmationMode = await continueFromSignupEmailOrLocalLogin(page, email, password);
			test.info().annotations.push({
				type: 'signup-confirmation-mode',
				description: confirmationMode
			});

			await expect(page.getByRole('heading', { name: 'Create your first Organization' })).toBeVisible();
			await page.getByLabel('Organization Name').fill(orgName);
			await page.getByRole('button', { name: 'Create Organization' }).click();

			const createdOrg = await waitForOwnedOrganization({ userId, name: orgName });
			orgId = createdOrg.id;
			const orgUrlSegment = createdOrg.url_slug ?? createdOrg.id;

			await expect(page).toHaveURL(new RegExp(`/org/${orgUrlSegment}(?:$|[/?#])`));
			await expect(page.getByRole('button', { name: 'Switch organization' })).toContainText(orgName);

			await page.goto(`/org/${orgUrlSegment}/billing`);
			await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
			await expect(page.getByRole('heading', { name: 'Plans & Pricing' })).toBeVisible();
			const pricingRegion = page.getByRole('region', { name: 'Plans & Pricing' });
			const teamUpgradeButton = pricingRegion.getByRole('button', { name: 'Upgrade to Team' });
			await teamUpgradeButton.scrollIntoViewIfNeeded();
			await expect(teamUpgradeButton).toBeVisible();
			await page.waitForLoadState('networkidle');

			await page.route(`**/org/${orgUrlSegment}/billing/checkout`, async (route) => {
				expect(route.request().method()).toBe('POST');
				expect(route.request().postDataJSON()).toEqual({ tier: 'team' });
				const checkoutAttemptId = randomUUID();
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						url: `${appBaseUrl}/org/${orgUrlSegment}/billing/success?checkout_attempt_id=${checkoutAttemptId}`
					})
				});
			});

			await teamUpgradeButton.click();
			const checkoutDialog = page.getByRole('dialog', { name: 'Upgrade to Team' });
			await expect(checkoutDialog).toBeVisible();
			await expect(checkoutDialog).toContainText(
				'Your Organization remains on its current plan until checkout is complete.'
			);

			const checkoutRequest = page.waitForRequest(
				(request) => request.url().endsWith(`/org/${orgUrlSegment}/billing/checkout`) && request.method() === 'POST'
			);
			await page.getByRole('button', { name: 'Continue to Checkout' }).click();
			await checkoutRequest;
			await expect(page).toHaveURL(new RegExp(`/org/${orgUrlSegment}/billing/success`));
		} finally {
			await cleanupSelfServiceRun({ email, userId, orgId });
		}
	});
});

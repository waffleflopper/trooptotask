import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { TEST_USERS } from '../fixtures/test-data';

test.describe('Authentication', () => {
	let loginPage: LoginPage;

	test.beforeEach(async ({ page }) => {
		loginPage = new LoginPage(page);
		await loginPage.goto();
	});

	test('login with valid credentials redirects to dashboard', async ({ page }) => {
		await loginPage.login(TEST_USERS.owner.email, TEST_USERS.owner.password);
		await loginPage.expectRedirectToDashboard();
	});

	test('login with invalid password shows error', async ({ page }) => {
		await loginPage.login(TEST_USERS.owner.email, 'WrongPassword123!');
		await loginPage.expectError();
	});

	test('login with empty fields shows validation error', async ({ page }) => {
		await loginPage.submitButton.click();
		// Browser native validation prevents form submission — email field should show validity error
		const emailInput = loginPage.emailInput;
		const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
		expect(isInvalid).toBe(true);
	});

	test('logout redirects to login page', async ({ browser }) => {
		// Start with an authenticated session
		const context = await browser.newContext({
			storageState: 'e2e/.auth/owner.json'
		});
		const page = await context.newPage();
		await page.goto('/auth/logout');
		// Logout redirects to '/' which then redirects to '/auth/login'
		await page.waitForURL('**/', { timeout: 10000 });
		await expect(page).toHaveURL(/\/auth\/login|\/$/);

		await context.close();
	});
});

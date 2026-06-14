import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { TEST_USERS } from '../fixtures/test-data';

test.describe('Authentication', () => {
	let loginPage: LoginPage;

	test.beforeEach(async ({ page }) => {
		loginPage = new LoginPage(page);
		await loginPage.goto();
	});

	test('login with valid credentials redirects to dashboard', async () => {
		await loginPage.login(TEST_USERS.owner.email, TEST_USERS.owner.password);
		await loginPage.expectRedirectToDashboard();
	});

	test('login with invalid password shows error', async () => {
		await loginPage.login(TEST_USERS.owner.email, 'WrongPassword123!');
		await loginPage.expectError();
	});

	test('login with empty fields shows validation error', async () => {
		await loginPage.submitButton.click();
		// Browser native validation prevents form submission — email field should show validity error
		const emailInput = loginPage.emailInput;
		const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
		expect(isInvalid).toBe(true);
	});

	test('logout redirects to login page', async ({ page }) => {
		await loginPage.login(TEST_USERS.owner.email, TEST_USERS.owner.password);
		await loginPage.expectRedirectToDashboard();
		const whatsNewDismissButton = page.getByRole('button', { name: 'Got it' });
		const dismissedWhatsNew = await whatsNewDismissButton
			.click({ timeout: 5000 })
			.then(() => true)
			.catch(() => false);
		if (dismissedWhatsNew) {
			await expect(page.getByRole('dialog', { name: "What's New" })).toBeHidden({ timeout: 5000 });
		}
		await page.getByLabel('Account menu').click();
		await page.getByRole('menuitem', { name: 'Sign Out' }).click();
		// Logout redirects to '/' which then redirects to '/auth/login'
		await page.waitForURL('**/', { timeout: 10000 });
		await expect(page).toHaveURL(/\/auth\/login|\/$/);
	});
});

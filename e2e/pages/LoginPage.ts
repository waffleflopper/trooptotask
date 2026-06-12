import { expect, type Page, type Locator } from '@playwright/test';

export class LoginPage {
	readonly page: Page;
	readonly emailInput: Locator;
	readonly passwordInput: Locator;
	readonly submitButton: Locator;
	readonly errorMessage: Locator;

	constructor(page: Page) {
		this.page = page;
		this.emailInput = page.getByTestId('login-email');
		this.passwordInput = page.getByTestId('login-password');
		this.submitButton = page.getByTestId('login-submit');
		this.errorMessage = page.getByRole('alert');
	}

	async goto() {
		await this.page.goto('/auth/login');
		await this.emailInput.waitFor({ state: 'visible', timeout: 10000 });
		await this.page.waitForLoadState('networkidle');
	}

	async login(email: string, password: string) {
		await this.emailInput.fill(email);
		await this.passwordInput.fill(password);
		await this.submitButton.click();
	}

	async expectError(text?: string) {
		await expect(this.errorMessage).toBeVisible({ timeout: 15000 });
		if (text) {
			await expect(this.errorMessage).toContainText(text);
		}
	}

	async expectRedirectToDashboard() {
		await this.page.waitForURL('**/org/**', { timeout: 30000 });
	}
}

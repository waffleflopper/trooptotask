import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class OnboardingPage {
	readonly page: Page;
	readonly startButton: Locator;

	constructor(page: Page) {
		this.page = page;
		this.startButton = page.getByRole('button', { name: 'Start Onboarding' });
	}

	async goto(orgId: string) {
		await this.page.goto(`/org/${orgId}/onboarding`);
		await this.page.waitForLoadState('networkidle');
	}

	async openStartModal() {
		await this.startButton.waitFor({ state: 'visible', timeout: 10000 });
		await this.startButton.click();
		await expect(this.page.getByRole('heading', { name: 'Start Onboarding' })).toBeVisible({ timeout: 5000 });
	}

	async selectPerson(name: string) {
		const trigger = this.page.getByRole('button', { name: 'Member' });
		await trigger.click();

		const combobox = this.page.getByRole('combobox');
		await combobox.waitFor({ state: 'visible', timeout: 5000 });
		await combobox.fill(name);

		const option = this.page.getByRole('option', { name: new RegExp(name, 'i') }).first();
		await option.waitFor({ state: 'visible', timeout: 5000 });
		await option.click();
	}

	async confirmStart() {
		const dialog = this.page.getByRole('dialog');
		const submitBtn = dialog.getByRole('button', { name: 'Start Onboarding' });
		await expect(submitBtn).toBeEnabled({ timeout: 5000 });
		await submitBtn.click();
		await expect(this.page.getByRole('heading', { name: 'Start Onboarding' })).not.toBeVisible({ timeout: 10000 });
	}

	async expectOnboardingVisible(personName: string) {
		await expect(this.packetTrigger(personName)).toBeVisible({ timeout: 10000 });
	}

	async expandOnboarding(personName: string) {
		await this.packetTrigger(personName).click();
	}

	async toggleCheckbox(stepName: string) {
		await expect(this.page.getByText(stepName, { exact: true })).toBeVisible({ timeout: 5000 });
		const checkbox = this.page.getByRole('checkbox').first();
		await checkbox.click();
	}

	async expectStepChecked(_stepName: string) {
		await expect(this.page.getByText('1/2')).toBeVisible({ timeout: 5000 });
	}

	private packetTrigger(personName: string) {
		return this.page.getByRole('button', { name: new RegExp(personName, 'i') }).first();
	}
}

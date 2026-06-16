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

		const option = this.page.getByRole('option', { name: new RegExp(escapeRegExp(name), 'i') }).first();
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
		const checkbox = this.stepCheckbox(stepName);
		await expect(checkbox).toBeVisible({ timeout: 5000 });
		await checkbox.click();
	}

	async expectStepChecked(stepName: string) {
		const completedSection = this.page.getByRole('dialog').getByRole('button', { name: /^Completed\s+\d+$/ });
		const checkbox = this.stepCheckbox(stepName);
		if (!(await checkbox.isVisible())) {
			await completedSection.click();
		}
		await expect(checkbox).toBeChecked({ timeout: 5000 });
	}

	private packetTrigger(personName: string) {
		return this.page.getByRole('button', { name: new RegExp(escapeRegExp(personName), 'i') }).first();
	}

	private stepCheckbox(stepName: string) {
		return this.page
			.getByRole('dialog')
			.getByRole('checkbox', { name: new RegExp(`Mark ${escapeRegExp(stepName)} (?:complete|incomplete)`, 'i') });
	}
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

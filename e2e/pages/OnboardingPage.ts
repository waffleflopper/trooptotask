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
		// SearchSelect: click the display button to open, then type in the combobox input
		const trigger = this.page.getByRole('button', { name: /Search for a person/i });
		await trigger.click();

		// Now a combobox input appears
		const combobox = this.page.getByRole('combobox');
		await combobox.waitFor({ state: 'visible', timeout: 5000 });
		await combobox.fill(name);

		// Click the matching option (role="option" with onmousedown)
		const option = this.page.getByRole('option', { name: new RegExp(name, 'i') }).first();
		await option.waitFor({ state: 'visible', timeout: 5000 });
		// Use dispatchEvent since SearchSelect uses onmousedown, not onclick
		await option.dispatchEvent('mousedown');
	}

	async confirmStart() {
		// Target the submit button inside the dialog, not the toolbar button
		const dialog = this.page.getByRole('dialog');
		const submitBtn = dialog.getByRole('button', { name: 'Start Onboarding' });
		await expect(submitBtn).toBeEnabled({ timeout: 5000 });
		await submitBtn.click();
		// Wait for modal to close
		await expect(this.page.getByRole('heading', { name: 'Start Onboarding' })).not.toBeVisible({ timeout: 10000 });
	}

	async expectOnboardingVisible(personName: string) {
		await expect(this.page.getByText(personName).first()).toBeVisible({ timeout: 10000 });
	}

	async expandOnboarding(personName: string) {
		const card = this.page.locator('.onboarding-card').filter({ hasText: personName }).first();
		await card.click();
	}

	async toggleCheckbox(stepName: string) {
		const stepRow = this.page.locator('.step-row').filter({ hasText: stepName }).first();
		// The checkbox is a <button> with aria-label "Mark complete"/"Mark incomplete"
		const checkbox = stepRow.getByRole('button', { name: /Mark complete|Mark incomplete/ });
		await checkbox.click();
	}

	async expectStepChecked(stepName: string) {
		const stepRow = this.page.locator('.step-row').filter({ hasText: stepName }).first();
		// When checked, the button has class "checked" and aria-label "Mark incomplete"
		await expect(stepRow.locator('.checkbox-toggle.checked')).toBeVisible({ timeout: 5000 });
	}
}

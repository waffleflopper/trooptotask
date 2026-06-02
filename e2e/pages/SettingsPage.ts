import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class SettingsPage {
	readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto(orgId: string) {
		await this.page.goto(`/org/${orgId}/settings`);
	}

	async gotoApprovals(orgId: string) {
		await this.page.goto(`/org/${orgId}/settings/approvals`);
	}

	async gotoArchived(orgId: string) {
		await this.page.goto(`/org/${orgId}/settings/archives`);
	}

	async gotoSettings(orgId: string) {
		await this.page.goto(`/org/${orgId}/settings/general`);
	}

	async approveRequest(index: number = 0) {
		const approveButtons = this.page.getByTestId('approve-btn');
		await approveButtons.nth(index).click();
	}

	async denyRequest(index: number = 0) {
		const denyButtons = this.page.getByTestId('deny-btn');
		await denyButtons.nth(index).click();
	}

	async restoreArchivedPerson(name: string) {
		const row = this.page.getByText(name).locator('..');
		await row.getByTestId('restore-btn').click();
	}

	async expectArchivedPersonVisible(name: string) {
		await expect(this.page.getByText(name).first()).toBeVisible();
	}
}

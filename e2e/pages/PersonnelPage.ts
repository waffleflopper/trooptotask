import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class PersonnelPage {
	readonly page: Page;
	readonly addButton: Locator;
	readonly personnelList: Locator;
	readonly firstNameInput: Locator;
	readonly lastNameInput: Locator;
	readonly rankSelect: Locator;
	readonly saveButton: Locator;

	constructor(page: Page) {
		this.page = page;
		this.addButton = page.getByTestId('add-personnel-btn');
		this.personnelList = page.getByTestId('personnel-list');
		this.firstNameInput = page.getByTestId('personnel-first-name');
		this.lastNameInput = page.getByTestId('personnel-last-name');
		this.rankSelect = page.getByTestId('personnel-rank');
		this.saveButton = page.getByTestId('personnel-save');
	}

	async goto(orgId: string) {
		await this.page.goto(`/org/${orgId}/personnel`);
	}

	async openAddModal() {
		await this.addButton.click();
	}

	async fillForm(data: { firstName: string; lastName: string; rank?: string }) {
		await this.firstNameInput.fill(data.firstName);
		await this.lastNameInput.fill(data.lastName);
		if (data.rank) {
			await this.rankSelect.selectOption(data.rank);
		}
	}

	async save() {
		await this.saveButton.click();
		// Wait for modal to close
		await this.saveButton.waitFor({ state: 'hidden', timeout: 5000 });
	}

	async expectPersonnelVisible(lastName: string) {
		await expect(this.page.getByText(lastName)).toBeVisible();
	}

	async expectPersonnelNotVisible(lastName: string) {
		await expect(this.page.getByText(lastName)).not.toBeVisible();
	}

	async clickPerson(name: string) {
		await this.page.getByText(name).click();
	}
}

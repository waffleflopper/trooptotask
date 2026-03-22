import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class PersonnelPage {
	readonly page: Page;
	readonly addButton: Locator;
	readonly searchInput: Locator;

	constructor(page: Page) {
		this.page = page;
		this.addButton = page.getByTestId('add-personnel-btn');
		// Search input: searchbox "Search by name, rank, or role..."
		this.searchInput = page.getByRole('searchbox', { name: /search by name/i });
	}

	async goto(orgId: string) {
		await this.page.goto(`/org/${orgId}/personnel`);
		await this.addButton.waitFor({ state: 'visible', timeout: 10000 });
		// Ensure page is fully hydrated before interacting
		await this.page.waitForLoadState('networkidle');
	}

	async openAddModal() {
		await this.addButton.waitFor({ state: 'visible' });
		await this.addButton.click();
		// Personnel modal opens — wait for the modal title
		await expect(this.page.getByText('Add Personnel').first()).toBeVisible({ timeout: 10000 });
	}

	async fillForm(data: { firstName: string; lastName: string; rank?: string }) {
		// Fields: textbox "Last Name *" (placeholder: Smith), textbox "First Name *" (placeholder: John)
		await this.page.getByRole('textbox', { name: 'Last Name' }).fill(data.lastName);
		await this.page.getByRole('textbox', { name: 'First Name' }).fill(data.firstName);
		if (data.rank) {
			// Rank is a combobox "Rank"
			await this.page.getByRole('combobox', { name: 'Rank' }).selectOption(data.rank);
		}
	}

	async save() {
		// Button text is "Add Personnel" (new) or "Save Changes" (edit)
		const saveBtn = this.page.getByRole('button', { name: /Add Personnel|Save Changes/ });
		await saveBtn.click();
		// Wait for modal to close
		await expect(this.page.getByRole('heading', { name: /Add Personnel|Edit Personnel/ })).not.toBeVisible({
			timeout: 10000
		});
	}

	async expectPersonnelVisible(name: string) {
		await expect(this.page.getByRole('main').getByText(name).first()).toBeVisible();
	}

	async expectPersonnelNotVisible(name: string) {
		await expect(this.page.getByRole('main').getByText(name)).not.toBeVisible();
	}

	async clickPerson(name: string) {
		// Find the row containing the person's name and click its Edit button
		const row = this.page.getByRole('row').filter({ hasText: new RegExp(name) }).first();
		await row.getByRole('button', { name: 'Edit' }).click();
	}

	async search(query: string) {
		await this.searchInput.fill(query);
	}
}

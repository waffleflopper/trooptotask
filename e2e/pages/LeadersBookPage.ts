import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class LeadersBookPage {
	readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto(orgId: string) {
		await this.page.goto(`/org/${orgId}/leaders-book`);
	}

	async selectPerson(name: string) {
		await this.page.getByText(name).click();
	}

	async addCounselingRecord() {
		await this.page.getByTestId('add-counseling-btn').click();
	}

	async fillCounselingForm(data: { type?: string; notes?: string }) {
		if (data.type) {
			const typeSelect = this.page.getByTestId('counseling-type');
			await typeSelect.selectOption(data.type);
		}
		if (data.notes) {
			const notesInput = this.page.getByTestId('counseling-notes');
			await notesInput.fill(data.notes);
		}
	}

	async saveCounseling() {
		const saveButton = this.page.getByTestId('counseling-save');
		await saveButton.click();
		await saveButton.waitFor({ state: 'hidden', timeout: 5000 });
	}

	async expectRecordVisible(text: string) {
		await expect(this.page.getByText(text)).toBeVisible();
	}
}

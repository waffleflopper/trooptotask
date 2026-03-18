import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class LeadersBookPage {
	readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto(orgId: string) {
		await this.page.goto(`/org/${orgId}/leaders-book`);
		await expect(this.page.getByText('Personnel').first()).toBeVisible({ timeout: 10000 });
		await this.page.waitForLoadState('networkidle');
	}

	async selectPerson(name: string) {
		const personCard = this.page.getByRole('button', { name: new RegExp(name) }).first();
		await personCard.click();
		// Wait for the SoldierLeadersBookView to load — has "Counselings" card with "+ New" button
		await expect(this.page.locator('.leader-card').filter({ hasText: 'Counselings' })).toBeVisible({ timeout: 10000 });
	}

	async addCounselingRecord() {
		// Click the "+ New" button in the Counselings card header
		// The Counselings section has a header with "Counselings (N)" and a "+ New" button
		const counselingsCard = this.page.locator('.leader-card').filter({ hasText: 'Counselings' });
		await counselingsCard.getByRole('button', { name: '+ New' }).click();
		// Wait for CounselingRecordModal to open
		await expect(this.page.getByRole('heading', { name: /New Counseling/ })).toBeVisible({ timeout: 5000 });
	}

	async fillCounselingForm(data: { type?: string; subject?: string; notes?: string }) {
		if (data.subject) {
			// Subject is a required field with placeholder "Subject of counseling..."
			await this.page.getByPlaceholder('Subject of counseling...').fill(data.subject);
		}
		if (data.notes) {
			// Notes textarea with placeholder "Brief notes or comments..."
			await this.page.getByPlaceholder('Brief notes or comments...').fill(data.notes);
		}
	}

	async saveCounseling() {
		// Click the Save button in the modal footer
		const saveButton = this.page.getByRole('button', { name: 'Save', exact: true });
		await saveButton.click();
		// Wait for modal to close
		await expect(this.page.getByRole('heading', { name: /New Counseling/ })).not.toBeVisible({ timeout: 5000 });
	}

	async expectRecordVisible(text: string) {
		await expect(this.page.getByText(text).first()).toBeVisible();
	}
}

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class TrainingPage {
	readonly page: Page;
	readonly trainingMatrix: Locator;

	constructor(page: Page) {
		this.page = page;
		this.trainingMatrix = page.getByTestId('training-matrix');
	}

	async goto(orgId: string) {
		await this.page.goto(`/org/${orgId}/training`);
	}

	async addRecord(personName: string, trainingType: string) {
		// Click on the person's training cell in the matrix to open the record modal
		// The exact selector depends on the matrix structure — clicking the cell
		// for person + training type intersection
		const cell = this.page.locator(`text=${personName}`).first();
		await cell.click();

		// The training record modal should open — fill and save
		const saveButton = this.page.getByTestId('training-save');
		await saveButton.click();
		await saveButton.waitFor({ state: 'hidden', timeout: 5000 });
	}

	async expectRecordVisible(personName: string, trainingType: string) {
		await expect(this.page.getByText(trainingType)).toBeVisible();
	}
}

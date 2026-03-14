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
		// Wait for the training page to load
		await expect(this.page.getByText('Training & Certifications').first()).toBeVisible({ timeout: 10000 });
	}

	async addRecord(personName: string, trainingType: string) {
		// Click on the person's name button in the training matrix to open PersonTrainingEditor
		const personButton = this.trainingMatrix.getByRole('button', { name: new RegExp(personName) }).first();
		await personButton.click();

		// Wait for the PersonTrainingEditor dialog to open
		await expect(this.page.getByRole('heading', { name: 'Training Records' })).toBeVisible({ timeout: 5000 });

		// Find the training type row and click the "Complete" button (quick complete for today)
		// or the "Today" button which marks as completed today
		const trainingItem = this.page.locator('.training-item').filter({ hasText: trainingType });
		const todayButton = trainingItem.getByRole('button', { name: 'Today' });
		const completeButton = trainingItem.getByRole('button', { name: 'Complete' });

		// Try "Today" first (for expiring training), then "Complete" (for never-expires)
		if (await todayButton.isVisible()) {
			await todayButton.click();
		} else if (await completeButton.isVisible()) {
			await completeButton.click();
		}

		// Close the PersonTrainingEditor via the footer Close button
		await this.page.locator('.modal-footer').getByRole('button', { name: 'Close' }).click();
	}

	async expectRecordVisible(personName: string, trainingType: string) {
		await expect(this.page.getByText(trainingType).first()).toBeVisible();
	}
}

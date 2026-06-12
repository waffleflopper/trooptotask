import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class TrainingPage {
	readonly page: Page;
	readonly trainingMatrix: Locator;

	constructor(page: Page) {
		this.page = page;
		this.trainingMatrix = page.getByRole('table', { name: 'Training status matrix' });
	}

	async goto(orgId: string) {
		await this.page.goto(`/org/${orgId}/training`);
		await expect(this.trainingMatrix).toBeVisible({ timeout: 10000 });
	}

	async addRecord(personName: string, trainingType: string) {
		const trainingCell = this.trainingCell(personName, trainingType);
		await expect(trainingCell).toBeVisible({ timeout: 5000 });
		await trainingCell.click();

		const dialog = this.page.getByRole('dialog', { name: /Add Training Record|Edit Training Record/ });
		await expect(dialog).toBeVisible({ timeout: 5000 });
		const completeCheckbox = dialog.getByRole('checkbox', { name: 'Mark as Complete' });
		if ((await completeCheckbox.count()) > 0 && !(await completeCheckbox.isChecked())) {
			await completeCheckbox.click();
		}
		const saveButton = dialog.getByTestId('training-save');
		await expect(saveButton).toBeEnabled({ timeout: 5000 });
		await saveButton.click();
		await expect(dialog).not.toBeVisible({ timeout: 10000 });
	}

	async expectTrainingCellStatus(personName: string, trainingType: string, status: string) {
		await expect(this.trainingCell(personName, trainingType, status)).toBeVisible({ timeout: 10000 });
	}

	private trainingCell(personName: string, trainingType: string, status?: string) {
		const statusPattern = status ? escapeRegExp(status) : '.+';
		return this.trainingMatrix
			.getByRole('button', {
				name: new RegExp(`^${escapeRegExp(personName)}\\s+${escapeRegExp(trainingType)}:\\s+${statusPattern}$`, 'i')
			})
			.first();
	}
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

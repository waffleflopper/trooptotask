import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class CalendarPage {
	readonly page: Page;
	readonly prevMonth: Locator;
	readonly nextMonth: Locator;
	readonly monthLabel: Locator;

	constructor(page: Page) {
		this.page = page;
		this.prevMonth = page.getByTestId('calendar-prev-month');
		this.nextMonth = page.getByTestId('calendar-next-month');
		this.monthLabel = page.getByTestId('calendar-month-label');
	}

	async goto(orgId: string) {
		await this.page.goto(`/org/${orgId}/calendar`);
	}

	async navigateNextMonth() {
		await this.nextMonth.click();
	}

	async navigatePrevMonth() {
		await this.prevMonth.click();
	}

	async setStatus(personName: string, date: string, statusType: string) {
		// Click on the person's cell for the given date to open status modal
		// The exact selector depends on the calendar grid structure
		const cell = this.page.locator(`[data-testid="calendar-cell-${personName}-${date}"]`);
		await cell.click();

		// Select status type in modal
		const statusSelect = this.page.getByTestId('status-type-select');
		await statusSelect.selectOption(statusType);

		// Save
		const saveButton = this.page.getByTestId('status-save');
		await saveButton.click();
		await saveButton.waitFor({ state: 'hidden', timeout: 5000 });
	}

	async expectStatusVisible(personName: string, statusText: string) {
		await expect(this.page.getByText(statusText)).toBeVisible();
	}

	async openTodayBreakdown() {
		await this.page.getByTestId('calendar-today-breakdown').click();
	}
}

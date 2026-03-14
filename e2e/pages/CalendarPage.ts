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
		await this.prevMonth.waitFor({ state: 'visible', timeout: 10000 });
		await this.page.waitForLoadState('networkidle');
	}

	async navigateNextMonth() {
		await this.nextMonth.click();
	}

	async navigatePrevMonth() {
		await this.prevMonth.click();
	}

	async expectStatusVisible(personName: string, statusText: string) {
		await expect(this.page.getByText(statusText).first()).toBeVisible();
	}

	async openTodayBreakdown() {
		await this.page.getByTestId('calendar-today-breakdown').click();
	}
}

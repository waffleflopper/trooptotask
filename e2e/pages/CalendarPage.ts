import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class CalendarPage {
	readonly page: Page;
	readonly prevMonth: Locator;
	readonly nextMonth: Locator;
	readonly monthLabel: Locator;
	readonly bulkStatusButton: Locator;
	readonly planningButton: Locator;
	readonly moreActionsButton: Locator;

	constructor(page: Page) {
		this.page = page;
		this.prevMonth = page.getByRole('button', { name: 'Prev' });
		this.nextMonth = page.getByRole('button', { name: 'Next' });
		this.monthLabel = page.getByTestId('calendar-month-label');
		this.bulkStatusButton = page.getByRole('button', { name: /Bulk Status/ });
		this.planningButton = page.getByRole('button', { name: /Planning/ });
		this.moreActionsButton = page.getByRole('button', { name: /More Calendar actions/i });
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

	async openFirstDateCellForPerson(personName: RegExp | string) {
		const personButton = this.page.getByRole('button', { name: personName }).first();
		const row = personButton.locator('xpath=..');

		await row.locator('button').nth(1).click();
	}

	async openMoreActions() {
		await this.moreActionsButton.click();
	}
}

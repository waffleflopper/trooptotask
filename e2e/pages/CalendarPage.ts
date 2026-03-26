import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class CalendarPage {
	readonly page: Page;
	readonly prevMonth: Locator;
	readonly nextMonth: Locator;
	readonly monthLabel: Locator;
	readonly todayBreakdownToolbarToggle: Locator;
	readonly todayBreakdownInlineToggle: Locator;
	readonly todayBreakdownBody: Locator;

	constructor(page: Page) {
		this.page = page;
		this.prevMonth = page.getByTestId('calendar-prev-month');
		this.nextMonth = page.getByTestId('calendar-next-month');
		this.monthLabel = page.getByTestId('calendar-month-label');
		this.todayBreakdownToolbarToggle = page.getByTestId('calendar-today-breakdown');
		this.todayBreakdownInlineToggle = page.getByTestId('today-breakdown-summary-toggle');
		this.todayBreakdownBody = page.getByTestId('today-breakdown-body');
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

	async toggleTodayBreakdownFromToolbar() {
		await this.todayBreakdownToolbarToggle.click();
	}

	async expectTodayBreakdownExpanded(expanded: boolean) {
		await expect(this.todayBreakdownBody).toHaveAttribute('aria-hidden', expanded ? 'false' : 'true');
	}
}

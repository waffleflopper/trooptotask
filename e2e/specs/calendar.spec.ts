import { test, expect } from '../fixtures/auth';
import { CalendarPage } from '../pages/CalendarPage';

test.describe('Calendar & Status', () => {
	let calendarPage: CalendarPage;

	test('navigate between months', async ({ ownerPage, orgId }) => {
		calendarPage = new CalendarPage(ownerPage);
		await calendarPage.goto(orgId);

		const initialMonth = await calendarPage.monthLabel.textContent();

		await calendarPage.navigateNextMonth();
		// Wait for the month to change — calendar may re-fetch data
		await expect(calendarPage.monthLabel).not.toHaveText(initialMonth!, { timeout: 10000 });

		const nextMonth = await calendarPage.monthLabel.textContent();

		await calendarPage.navigatePrevMonth();
		await expect(calendarPage.monthLabel).not.toHaveText(nextMonth!, { timeout: 10000 });
	});

	test('set a person status for a date', async ({ ownerPage, orgId }) => {
		calendarPage = new CalendarPage(ownerPage);
		await calendarPage.goto(orgId);

		await calendarPage.openFirstDateCellForPerson(/Doe/);

		await expect(ownerPage.getByRole('dialog', { name: 'Set Personnel Status' })).toBeVisible({ timeout: 10000 });

		await ownerPage.getByRole('button', { name: 'Add Status' }).click();

		await expect(ownerPage.getByText('Current Status').first()).toBeVisible({ timeout: 5000 });
	});

	test('shows the status legend for the current calendar grid', async ({ ownerPage, orgId }) => {
		calendarPage = new CalendarPage(ownerPage);
		await calendarPage.goto(orgId);

		const legend = ownerPage.getByLabel('Status color legend');
		await expect(legend.getByText('Present')).toBeVisible();
		await expect(legend.getByText('Leave')).toBeVisible();
		await expect(legend.getByText('TDY')).toBeVisible();
	});

	test('calendar actions start compact on mobile', async ({ ownerPage, orgId }) => {
		await ownerPage.setViewportSize({ width: 390, height: 844 });

		calendarPage = new CalendarPage(ownerPage);
		await calendarPage.goto(orgId);

		await expect(calendarPage.bulkStatusButton).toBeHidden();
		await expect(calendarPage.planningButton).toBeHidden();
		await expect(calendarPage.moreActionsButton).toBeVisible();
	});

	test('smart toolbar re-expands items after the viewport grows again', async ({ ownerPage, orgId }) => {
		await ownerPage.setViewportSize({ width: 1400, height: 900 });

		calendarPage = new CalendarPage(ownerPage);
		await calendarPage.goto(orgId);

		await expect(calendarPage.bulkStatusButton).toBeVisible();
		await expect(calendarPage.planningButton).toBeVisible();
		await expect(calendarPage.moreActionsButton).toBeVisible();

		await ownerPage.setViewportSize({ width: 390, height: 844 });
		await expect(calendarPage.bulkStatusButton).toBeHidden();
		await expect(calendarPage.planningButton).toBeHidden();
		await calendarPage.openMoreActions();
		await expect(ownerPage.getByRole('menu').getByText('Bulk Status')).toBeVisible();
		await expect(ownerPage.getByRole('menu').getByText('Planning')).toBeVisible();

		await ownerPage.setViewportSize({ width: 1400, height: 900 });
		await expect(calendarPage.bulkStatusButton).toBeVisible();
		await expect(calendarPage.planningButton).toBeVisible();
	});
});

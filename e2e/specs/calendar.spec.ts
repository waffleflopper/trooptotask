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

		// Click on a person's name in the calendar grid to open AvailabilityModal
		// Person names appear as buttons in the personnel column
		const personButton = ownerPage.getByRole('button', { name: /Doe/ }).first();
		await personButton.click();

		// The AvailabilityModal opens with title "Set Status"
		await expect(ownerPage.getByRole('heading', { name: 'Set Status' })).toBeVisible({ timeout: 5000 });

		// Status type defaults to first option, dates default to clicked date
		// Just click "Add Status" to add with defaults
		await ownerPage.getByRole('button', { name: 'Add Status' }).click();

		// Verify status was added — the modal stays open showing the new entry
		// Look for "Current Status" section that appears when entries exist
		await expect(ownerPage.getByText('Current Status').first()).toBeVisible({ timeout: 5000 });
	});

	test('view today breakdown', async ({ ownerPage, orgId }) => {
		calendarPage = new CalendarPage(ownerPage);
		await calendarPage.goto(orgId);

		await calendarPage.expectTodayBreakdownExpanded(true);
		await expect(ownerPage.getByTestId('today-breakdown-panel')).toContainText(/present/i);

		await calendarPage.toggleTodayBreakdownFromToolbar();
		await calendarPage.expectTodayBreakdownExpanded(false);

		await calendarPage.toggleTodayBreakdownFromToolbar();
		await calendarPage.expectTodayBreakdownExpanded(true);
	});

	test('today breakdown starts collapsed on mobile', async ({ ownerPage, orgId }) => {
		await ownerPage.setViewportSize({ width: 390, height: 844 });

		calendarPage = new CalendarPage(ownerPage);
		await calendarPage.goto(orgId);

		await calendarPage.expectTodayBreakdownExpanded(false);
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
		await calendarPage.moreActionsButton.click();
		await expect(ownerPage.getByRole('menu').getByText('Bulk Status')).toBeVisible();
		await expect(ownerPage.getByRole('menuitem', { name: 'Add Bulk' })).toBeVisible();

		await ownerPage.setViewportSize({ width: 1400, height: 900 });
		await expect(calendarPage.bulkStatusButton).toBeVisible();
		await expect(calendarPage.planningButton).toBeVisible();
	});
});

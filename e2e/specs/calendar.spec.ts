import { test, expect } from '../fixtures/auth';
import { CalendarPage } from '../pages/CalendarPage';

test.describe('Calendar & Status', () => {
	let calendarPage: CalendarPage;

	test('navigate between months', async ({ ownerPage, orgId }) => {
		calendarPage = new CalendarPage(ownerPage);
		await calendarPage.goto(orgId);

		const initialMonth = await calendarPage.monthLabel.textContent();

		await calendarPage.navigateNextMonth();
		const nextMonth = await calendarPage.monthLabel.textContent();
		expect(nextMonth).not.toBe(initialMonth);

		await calendarPage.navigatePrevMonth();
		const prevMonth = await calendarPage.monthLabel.textContent();
		expect(prevMonth).toBe(initialMonth);
	});

	test('set a person status for a date', async ({ ownerPage, orgId }) => {
		calendarPage = new CalendarPage(ownerPage);
		await calendarPage.goto(orgId);

		// Set status for seed person "Doe" — exact date/cell selectors
		// will need refinement based on actual calendar grid DOM
		await calendarPage.setStatus('Doe', 'today', 'Leave');
		await calendarPage.expectStatusVisible('Doe', 'Leave');
	});

	test('view today breakdown', async ({ ownerPage, orgId }) => {
		calendarPage = new CalendarPage(ownerPage);
		await calendarPage.goto(orgId);

		await calendarPage.openTodayBreakdown();
		// Verify the breakdown panel/modal is visible
		await expect(ownerPage.getByText(/breakdown/i)).toBeVisible();
	});
});

import { test, expect } from '../fixtures/auth';
import { CalendarPage } from '../pages/CalendarPage';
import { DutyRosterPage } from '../pages/DutyRosterPage';

test.describe('Duty Roster', () => {
	test('creates a template, accepts a generated run, and applies it to the calendar', async ({ ownerPage, orgId }) => {
		const dutyRosterPage = new DutyRosterPage(ownerPage);
		const calendarPage = new CalendarPage(ownerPage);
		const runWindow = nextDutyRosterWindow();
		const suffix = Date.now().toString(36);
		const template = {
			name: `E2E Roster ${suffix}`,
			slug: `e2e-roster-${suffix}`,
			shortCode: `E2E${suffix.slice(-5).toUpperCase()}`
		};

		await dutyRosterPage.createTemplate(orgId, template);

		await dutyRosterPage.goto(orgId);
		await dutyRosterPage.expectTemplateInRegister(template.name);
		await dutyRosterPage.openGenerateForTemplate(template.name);

		await dutyRosterPage.generatePreview({ endDayOfMonth: runWindow.endDayOfMonth });
		await dutyRosterPage.acceptAndApplyRun(orgId, template.slug);

		await calendarPage.goto(orgId);
		await navigateCalendarToMonth(calendarPage, runWindow.monthLabel);
		const assignmentMarker = ownerPage
			.locator('[data-slot="date-cell-marker"]')
			.filter({ hasText: template.shortCode })
			.first();
		await expect(assignmentMarker).toBeVisible({ timeout: 15000 });
		await expect(assignmentMarker).toHaveAttribute('title', template.name);
	});
});

function nextDutyRosterWindow(now = new Date()) {
	const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
	return {
		endDayOfMonth: 3,
		monthLabel: new Intl.DateTimeFormat('en-US', {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(start)
	};
}

async function navigateCalendarToMonth(calendarPage: CalendarPage, targetMonthLabel: string) {
	for (let attempt = 0; attempt < 18; attempt += 1) {
		const currentMonthLabel = (await calendarPage.monthLabel.textContent())?.trim();
		if (currentMonthLabel === targetMonthLabel) return;

		await calendarPage.navigateNextMonth();
		if (currentMonthLabel) {
			await expect(calendarPage.monthLabel).not.toHaveText(currentMonthLabel, { timeout: 10000 });
		}
	}

	throw new Error(`Calendar did not reach ${targetMonthLabel}`);
}

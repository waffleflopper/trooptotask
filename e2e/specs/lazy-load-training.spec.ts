import { test, expect } from '../fixtures/auth';
import { CalendarPage } from '../pages/CalendarPage';
import { PersonnelPage } from '../pages/PersonnelPage';
import { SettingsPage } from '../pages/SettingsPage';

test.describe('Pages load without training data (lazy-load verification)', () => {
	test('calendar page loads without console errors', async ({ ownerPage, orgId }) => {
		const errors: string[] = [];
		ownerPage.on('console', (msg) => {
			if (msg.type() === 'error') errors.push(msg.text());
		});

		const calendarPage = new CalendarPage(ownerPage);
		await calendarPage.goto(orgId);

		await expect(calendarPage.monthLabel).toBeVisible({ timeout: 10000 });
		expect(errors.filter((e) => /training|undefined|null|map/i.test(e))).toEqual([]);
	});

	test('personnel page loads without console errors', async ({ ownerPage, orgId }) => {
		const errors: string[] = [];
		ownerPage.on('console', (msg) => {
			if (msg.type() === 'error') errors.push(msg.text());
		});

		const personnelPage = new PersonnelPage(ownerPage);
		await personnelPage.goto(orgId);

		await expect(ownerPage.getByText('Doe').first()).toBeVisible({ timeout: 10000 });
		expect(errors.filter((e) => /training|undefined|null|map/i.test(e))).toEqual([]);
	});

	test('settings page loads without console errors', async ({ ownerPage, orgId }) => {
		const errors: string[] = [];
		ownerPage.on('console', (msg) => {
			if (msg.type() === 'error') errors.push(msg.text());
		});

		const settingsPage = new SettingsPage(ownerPage);
		await settingsPage.gotoApprovals(orgId);

		await expect(ownerPage.getByRole('heading', { name: 'Organization Settings' })).toBeVisible({
			timeout: 10000
		});
		await expect(ownerPage.getByRole('link', { name: 'Approvals' })).toBeVisible();
		expect(errors.filter((e) => /training|undefined|null|map/i.test(e))).toEqual([]);
	});
});

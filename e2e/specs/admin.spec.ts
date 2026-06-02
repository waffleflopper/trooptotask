import { test, expect } from '../fixtures/auth';
import { SettingsPage } from '../pages/SettingsPage';

test.describe('Organization Settings', () => {
	let settingsPage: SettingsPage;

	test('view approvals page', async ({ ownerPage, orgId }) => {
		settingsPage = new SettingsPage(ownerPage);
		await settingsPage.gotoApprovals(orgId);
		await expect(ownerPage.getByRole('heading', { name: 'Organization Settings' })).toBeVisible();
		await expect(ownerPage.getByRole('link', { name: 'Approvals' })).toBeVisible();
	});

	test('view archived personnel page', async ({ ownerPage, orgId }) => {
		settingsPage = new SettingsPage(ownerPage);
		await settingsPage.gotoArchived(orgId);
		await expect(ownerPage.getByRole('heading', { name: 'Organization Settings' })).toBeVisible();
		await expect(ownerPage.getByRole('heading', { name: 'Archived Records' })).toBeVisible();
	});

	test('view settings page', async ({ ownerPage, orgId }) => {
		settingsPage = new SettingsPage(ownerPage);
		await settingsPage.gotoSettings(orgId);
		await expect(ownerPage.getByRole('heading', { name: 'Organization Settings' })).toBeVisible();
	});
});

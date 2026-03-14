import { test, expect } from '../fixtures/auth';
import { AdminPage } from '../pages/AdminPage';

test.describe('Admin Hub', () => {
	let adminPage: AdminPage;

	test('view approvals page', async ({ ownerPage, orgId }) => {
		adminPage = new AdminPage(ownerPage);
		await adminPage.gotoApprovals(orgId);
		// Verify page loads — heading should be visible
		await expect(ownerPage.getByRole('heading', { name: 'Approvals' })).toBeVisible();
	});

	test('view archived personnel page', async ({ ownerPage, orgId }) => {
		adminPage = new AdminPage(ownerPage);
		await adminPage.gotoArchived(orgId);
		// Verify page loads — heading should be visible
		await expect(ownerPage.getByRole('heading', { name: 'Archived Personnel' })).toBeVisible();
	});

	test('view settings page', async ({ ownerPage, orgId }) => {
		adminPage = new AdminPage(ownerPage);
		await adminPage.gotoSettings(orgId);
		await expect(ownerPage.getByRole('heading', { name: 'Organization Settings' })).toBeVisible();
	});
});

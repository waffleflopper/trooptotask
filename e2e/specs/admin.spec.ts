import { test, expect } from '../fixtures/auth';
import { AdminPage } from '../pages/AdminPage';

test.describe('Admin Hub', () => {
	let adminPage: AdminPage;

	test('view approvals page', async ({ ownerPage, orgId }) => {
		adminPage = new AdminPage(ownerPage);
		await adminPage.gotoApprovals(orgId);
		// Verify page loads — may show empty state if no pending requests
		await expect(ownerPage.getByText(/approval|pending|no pending/i)).toBeVisible();
	});

	test('view archived personnel page', async ({ ownerPage, orgId }) => {
		adminPage = new AdminPage(ownerPage);
		await adminPage.gotoArchived(orgId);
		// Verify page loads
		await expect(ownerPage.getByText(/archived|no archived/i)).toBeVisible();
	});

	test('view settings page', async ({ ownerPage, orgId }) => {
		adminPage = new AdminPage(ownerPage);
		await adminPage.gotoSettings(orgId);
		await expect(ownerPage.getByText(/settings|retention/i)).toBeVisible();
	});
});

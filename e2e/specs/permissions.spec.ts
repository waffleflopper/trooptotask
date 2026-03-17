import { test, expect } from '../fixtures/auth';

test.describe('Permissions', () => {
	test('member cannot see admin link in navigation', async ({ memberPage, orgId }) => {
		await memberPage.goto(`/org/${orgId}/calendar`);
		// Admin link should not be visible in the navigation
		// Use a role-based locator to target the nav link specifically
		await expect(memberPage.getByRole('link', { name: 'Admin' })).not.toBeVisible();
	});

	test('member cannot access admin route directly', async ({ memberPage, orgId }) => {
		await memberPage.goto(`/org/${orgId}/admin`);
		// Admin layout server throws 403, which renders the error page
		// The error page shows a heading with "403" and a message about permissions
		await expect(memberPage.getByText("You don't have permission to view this page.")).toBeVisible();
	});

	test('scoped member only sees their group personnel', async ({ memberPage, orgId }) => {
		await memberPage.goto(`/org/${orgId}/calendar`);
		// Member is scoped to TEST_GROUP (Alpha Team)
		// Should only see personnel in that group
		// Verify seed personnel from other groups are not visible
		// This test needs refinement based on whether we add personnel to other groups in setup
	});

	test('owner can access admin features', async ({ ownerPage, orgId }) => {
		await ownerPage.goto(`/org/${orgId}/admin`);
		// Admin page redirects to /admin/approvals — check the nav tabs are present
		await expect(ownerPage.getByRole('link', { name: 'Approvals' })).toBeVisible();
		await expect(ownerPage.getByRole('link', { name: 'Archived Personnel' })).toBeVisible();
		await expect(ownerPage.getByRole('link', { name: 'Audit Log' })).toBeVisible();
		await expect(ownerPage.getByRole('link', { name: 'Settings' })).toBeVisible();
	});

	test('admin can access admin features', async ({ adminPage, orgId }) => {
		await adminPage.goto(`/org/${orgId}/admin`);
		// Admin page redirects to /admin/approvals — check the nav tabs are present
		await expect(adminPage.getByRole('link', { name: 'Approvals' })).toBeVisible();
		await expect(adminPage.getByRole('link', { name: 'Archived Personnel' })).toBeVisible();
		await expect(adminPage.getByRole('link', { name: 'Audit Log' })).toBeVisible();
		await expect(adminPage.getByRole('link', { name: 'Settings' })).toBeVisible();
	});
});

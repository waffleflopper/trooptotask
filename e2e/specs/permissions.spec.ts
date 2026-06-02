import { test, expect } from '../fixtures/auth';

test.describe('Permissions', () => {
	test('member cannot see organization settings link in navigation', async ({ memberPage, orgId }) => {
		await memberPage.goto(`/org/${orgId}/calendar`);
		await expect(memberPage.getByRole('link', { name: 'Organization Settings' })).not.toBeVisible();
	});

	test('member cannot access organization settings route directly', async ({ memberPage, orgId }) => {
		await memberPage.goto(`/org/${orgId}/settings`);
		await expect(memberPage.getByText("You don't have permission to view this page.")).toBeVisible();
	});

	test('scoped member only sees their group personnel', async ({ memberPage, orgId }) => {
		await memberPage.goto(`/org/${orgId}/calendar`);
		// Member is scoped to TEST_GROUP (Alpha Team)
		// Should only see personnel in that group
		// Verify seed personnel from other groups are not visible
		// This test needs refinement based on whether we add personnel to other groups in setup
	});

	test('owner can access organization settings features', async ({ ownerPage, orgId }) => {
		await ownerPage.goto(`/org/${orgId}/settings`);
		await expect(ownerPage.getByRole('link', { name: 'Approvals' })).toBeVisible();
		await expect(ownerPage.getByRole('link', { name: 'Archives' })).toBeVisible();
		await expect(ownerPage.getByRole('link', { name: 'Logs' })).toBeVisible();
		await expect(ownerPage.getByRole('link', { name: 'General' })).toBeVisible();
	});

	test('admin can access organization settings features', async ({ adminPage, orgId }) => {
		await adminPage.goto(`/org/${orgId}/settings`);
		await expect(adminPage.getByRole('link', { name: 'Approvals' })).toBeVisible();
		await expect(adminPage.getByRole('link', { name: 'Archives' })).toBeVisible();
		await expect(adminPage.getByRole('link', { name: 'Logs' })).toBeVisible();
		await expect(adminPage.getByRole('link', { name: 'General' })).toBeVisible();
	});
});

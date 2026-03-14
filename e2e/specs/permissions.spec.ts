import { test, expect } from '../fixtures/auth';

test.describe('Permissions', () => {
	test('member cannot see admin link in navigation', async ({ memberPage, orgId }) => {
		await memberPage.goto(`/org/${orgId}/calendar`);
		await expect(memberPage.getByText('Admin')).not.toBeVisible();
	});

	test('member cannot access admin route directly', async ({ memberPage, orgId }) => {
		await memberPage.goto(`/org/${orgId}/admin`);
		// Should see permission denied message or be redirected
		await expect(
			memberPage.getByText(/don't have permission|not authorized|access denied/i)
		).toBeVisible();
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
		await expect(ownerPage.getByText(/approvals|archived|audit|settings/i)).toBeVisible();
	});

	test('admin can access admin features', async ({ adminPage, orgId }) => {
		await adminPage.goto(`/org/${orgId}/admin`);
		await expect(adminPage.getByText(/approvals|archived|audit|settings/i)).toBeVisible();
	});
});

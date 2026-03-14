import { test, expect } from '../fixtures/auth';

test.describe('Bulk Import', () => {
	test('bulk import option is accessible from personnel page', async ({ ownerPage, orgId }) => {
		await ownerPage.goto(`/org/${orgId}/personnel`);
		await ownerPage.waitForLoadState('networkidle');

		const moreButton = ownerPage.getByRole('button', { name: /more actions/i });
		await moreButton.waitFor({ state: 'visible', timeout: 10000 });
		await moreButton.click();

		// Verify the "Bulk Import" option is visible in the dropdown
		await expect(ownerPage.getByText('Bulk Import')).toBeVisible({ timeout: 5000 });
	});
});

import { test, expect } from '../fixtures/auth';

test.describe('Bulk Import', () => {
	test('personnel import route is accessible from personnel page', async ({ ownerPage, orgId }) => {
		await ownerPage.goto(`/org/${orgId}/personnel`);
		await ownerPage.waitForLoadState('networkidle');

		const importLink = ownerPage.getByRole('link', { name: 'Import' });
		await importLink.waitFor({ state: 'visible', timeout: 10000 });
		await importLink.click();

		await expect(ownerPage).toHaveURL(new RegExp(`/org/${orgId}/personnel/import$`));
		await expect(ownerPage.getByRole('heading', { name: 'Build the roster from one file' })).toBeVisible({
			timeout: 5000
		});
	});
});

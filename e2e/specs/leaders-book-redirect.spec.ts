import { test, expect } from '../fixtures/auth';

test.describe('Leaders Book redirect', () => {
	test('navigating to /leaders-book redirects to dashboard', async ({ ownerPage, orgId }) => {
		await ownerPage.goto(`/org/${orgId}/leaders-book`);

		await ownerPage.waitForURL(`**/org/${orgId}`, { timeout: 10000 });
		await expect(ownerPage).toHaveURL(`/org/${orgId}`);
	});
});

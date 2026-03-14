import { test as base, type Page } from '@playwright/test';
import { TEST_ORG } from './test-data';

type AuthFixtures = {
	ownerPage: Page;
	adminPage: Page;
	memberPage: Page;
	orgId: string;
};

export const test = base.extend<AuthFixtures>({
	ownerPage: async ({ browser }, use) => {
		const context = await browser.newContext({
			storageState: 'e2e/.auth/owner.json'
		});
		const page = await context.newPage();
		await use(page);
		await context.close();
	},

	adminPage: async ({ browser }, use) => {
		const context = await browser.newContext({
			storageState: 'e2e/.auth/admin.json'
		});
		const page = await context.newPage();
		await use(page);
		await context.close();
	},

	memberPage: async ({ browser }, use) => {
		const context = await browser.newContext({
			storageState: 'e2e/.auth/member.json'
		});
		const page = await context.newPage();
		await use(page);
		await context.close();
	},

	orgId: TEST_ORG.id
});

export { expect } from '@playwright/test';

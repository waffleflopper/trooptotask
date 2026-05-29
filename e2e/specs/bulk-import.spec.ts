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

	test('personnel import supports upload preview submit and return flow', async ({ ownerPage, orgId }) => {
		const uniqueSuffix = Date.now();
		await ownerPage.goto(`/org/${orgId}/personnel/import`);
		await ownerPage.waitForLoadState('networkidle');

		await ownerPage.locator('#fileUpload').setInputFiles({
			name: 'personnel-import.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(
				[
					'Rank,Last Name,First Name,MOS,Duty Role,Group,ETS,PCS / DEROS',
					`SGT,Import${uniqueSuffix},Casey,68W,Medic,,2027-05-01,2026-11-30`,
					`BAD,Invalid${uniqueSuffix},Rank,68W,Medic,,2027-05-01,2026-11-30`
				].join('\n')
			)
		});

		await ownerPage.getByRole('button', { name: /Preview 2 Rows/i }).click();

		await expect(ownerPage.getByRole('table', { name: 'Personnel import preview' })).toBeVisible();
		await expect(ownerPage.getByText('1 errors')).toBeVisible();
		await expect(ownerPage.getByText('1 ready')).toBeVisible();

		await ownerPage.getByRole('button', { name: 'Import checked rows' }).click();

		await expect(ownerPage.getByText(/Import complete/i)).toBeVisible({ timeout: 10000 });
		await expect(ownerPage.getByText('Saved')).toBeVisible();
		await ownerPage.getByRole('button', { name: 'Return to Personnel' }).click();

		await expect(ownerPage).toHaveURL(new RegExp(`/org/${orgId}/personnel$`));
	});
});

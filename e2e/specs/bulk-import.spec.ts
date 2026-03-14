import { test, expect } from '../fixtures/auth';
import path from 'path';

test.describe('Bulk Import', () => {
	test('upload valid personnel CSV and import', async ({ ownerPage, orgId }) => {
		await ownerPage.goto(`/org/${orgId}/calendar`);

		// Open bulk import — exact trigger depends on UI (menu button, etc.)
		// Use existing test CSV from test-data/ directory
		const csvPath = path.resolve('test-data/personnel_import_sample.csv');

		// Find and use the file upload input
		const fileInput = ownerPage.getByTestId('bulk-import-file');
		await fileInput.setInputFiles(csvPath);

		// Verify preview step shows parsed data
		await expect(ownerPage.getByText(/preview|review/i)).toBeVisible();

		// Confirm import
		const confirmButton = ownerPage.getByTestId('bulk-import-confirm');
		await confirmButton.click();

		// Verify success message
		await expect(ownerPage.getByText(/success|imported/i)).toBeVisible();
	});

	test('upload CSV with errors shows validation', async ({ ownerPage, orgId }) => {
		await ownerPage.goto(`/org/${orgId}/calendar`);

		const csvPath = path.resolve('test-data/personnel_import_with_errors.csv');
		const fileInput = ownerPage.getByTestId('bulk-import-file');
		await fileInput.setInputFiles(csvPath);

		// Verify error indicators
		await expect(ownerPage.getByText(/error|invalid/i)).toBeVisible();
	});
});

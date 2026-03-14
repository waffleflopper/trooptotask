import { test, expect } from '../fixtures/auth';
import { PersonnelPage } from '../pages/PersonnelPage';

test.describe('Personnel Management', () => {
	let personnelPage: PersonnelPage;

	test('add a new person', async ({ ownerPage, orgId }) => {
		personnelPage = new PersonnelPage(ownerPage);
		await personnelPage.goto(orgId);

		await personnelPage.openAddModal();
		await personnelPage.fillForm({
			firstName: 'TestAdd',
			lastName: 'NewPerson',
			rank: 'CPL'
		});
		await personnelPage.save();

		await personnelPage.expectPersonnelVisible('NewPerson');
	});

	test('edit an existing person', async ({ ownerPage, orgId }) => {
		personnelPage = new PersonnelPage(ownerPage);
		await personnelPage.goto(orgId);

		await personnelPage.clickPerson('Doe');

		// Wait for edit modal — check for any modal heading
		await expect(ownerPage.getByRole('heading', { name: 'Edit Personnel' })).toBeVisible({ timeout: 5000 });

		// Clear and re-fill last name
		const lastNameInput = ownerPage.getByRole('textbox', { name: 'Last Name' });
		await lastNameInput.clear();
		await lastNameInput.fill('UpdatedDoe');
		await personnelPage.save();

		await personnelPage.expectPersonnelVisible('UpdatedDoe');
	});

	test('archive a person', async ({ ownerPage, orgId }) => {
		personnelPage = new PersonnelPage(ownerPage);
		await personnelPage.goto(orgId);

		await personnelPage.clickPerson('Jones');

		// Wait for modal
		await expect(ownerPage.getByRole('heading', { name: 'Edit Personnel' })).toBeVisible({ timeout: 5000 });

		// Look for archive/delete button in modal footer
		const archiveBtn = ownerPage.getByRole('button', { name: /archive|delete/i }).first();
		await archiveBtn.click();

		// Confirm dialog
		await expect(ownerPage.getByRole('heading', { name: /archive|confirm/i })).toBeVisible({ timeout: 5000 });
		await ownerPage.getByRole('button', { name: /archive|confirm|yes/i }).last().click();

		// Jones should no longer be visible
		await personnelPage.expectPersonnelNotVisible('Jones');
	});

	test('search/filter personnel list', async ({ ownerPage, orgId }) => {
		personnelPage = new PersonnelPage(ownerPage);
		await personnelPage.goto(orgId);

		await personnelPage.search('Doe');

		await personnelPage.expectPersonnelVisible('Doe');
		await personnelPage.expectPersonnelNotVisible('Smith');

		// Clear search — all should be visible again
		await personnelPage.searchInput.clear();
		await personnelPage.expectPersonnelVisible('Smith');
	});
});

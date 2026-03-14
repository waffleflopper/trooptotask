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

		// Click on a seed person to open edit modal
		await personnelPage.clickPerson('Doe');

		// Clear and re-fill last name
		await personnelPage.lastNameInput.clear();
		await personnelPage.lastNameInput.fill('UpdatedDoe');
		await personnelPage.save();

		await personnelPage.expectPersonnelVisible('UpdatedDoe');
	});

	test('archive a person', async ({ ownerPage, orgId }) => {
		personnelPage = new PersonnelPage(ownerPage);
		await personnelPage.goto(orgId);

		// Click person, then archive
		await personnelPage.clickPerson('Jones');

		// Look for archive button in the modal
		const archiveButton = ownerPage.getByTestId('personnel-archive');
		await archiveButton.click();

		// Confirm dialog
		const confirmButton = ownerPage.getByRole('button', { name: /confirm|yes|archive/i });
		await confirmButton.click();

		await personnelPage.expectPersonnelNotVisible('Jones');
	});

	test('search/filter personnel list', async ({ ownerPage, orgId }) => {
		personnelPage = new PersonnelPage(ownerPage);
		await personnelPage.goto(orgId);

		// Search for a seed person by name
		const searchInput = ownerPage.getByTestId('personnel-search');
		await searchInput.fill('Doe');

		// Should see Doe, not Smith
		await personnelPage.expectPersonnelVisible('Doe');
		await personnelPage.expectPersonnelNotVisible('Smith');

		// Clear search — all should be visible again
		await searchInput.clear();
		await personnelPage.expectPersonnelVisible('Smith');
	});
});

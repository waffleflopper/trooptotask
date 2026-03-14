import { test, expect } from '../fixtures/auth';
import { LeadersBookPage } from '../pages/LeadersBookPage';

test.describe('Leaders Book / Counseling', () => {
	let leadersBookPage: LeadersBookPage;

	test('view leaders book page', async ({ ownerPage, orgId }) => {
		leadersBookPage = new LeadersBookPage(ownerPage);
		await leadersBookPage.goto(orgId);
		// Verify page loads with seed personnel visible
		await expect(ownerPage.getByText('Doe')).toBeVisible();
	});

	test('add a counseling record', async ({ ownerPage, orgId }) => {
		leadersBookPage = new LeadersBookPage(ownerPage);
		await leadersBookPage.goto(orgId);

		await leadersBookPage.selectPerson('Doe');
		await leadersBookPage.addCounselingRecord();
		await leadersBookPage.fillCounselingForm({
			notes: 'E2E test counseling record'
		});
		await leadersBookPage.saveCounseling();

		await leadersBookPage.expectRecordVisible('E2E test counseling record');
	});
});

import { test, expect } from '../fixtures/auth';
import { LeadersBookPage } from '../pages/LeadersBookPage';

test.describe('Leaders Book / Counseling', () => {
	let leadersBookPage: LeadersBookPage;

	test('view leaders book page', async ({ ownerPage, orgId }) => {
		leadersBookPage = new LeadersBookPage(ownerPage);
		await leadersBookPage.goto(orgId);
		// Verify page loads with seed personnel visible — use first() since name may appear in multiple places
		await expect(ownerPage.getByText('Doe').first()).toBeVisible();
	});

	test('add a counseling record', async ({ ownerPage, orgId }) => {
		leadersBookPage = new LeadersBookPage(ownerPage);
		await leadersBookPage.goto(orgId);

		await leadersBookPage.selectPerson('Doe');
		await leadersBookPage.addCounselingRecord();
		await leadersBookPage.fillCounselingForm({
			subject: 'E2E test counseling',
			notes: 'E2E test counseling record'
		});
		await leadersBookPage.saveCounseling();

		await leadersBookPage.expectRecordVisible('E2E test counseling');
	});
});

import { test, expect } from '../fixtures/auth';
import { TrainingPage } from '../pages/TrainingPage';

test.describe('Training Records', () => {
	let trainingPage: TrainingPage;

	test('view training matrix', async ({ ownerPage, orgId }) => {
		trainingPage = new TrainingPage(ownerPage);
		await trainingPage.goto(orgId);

		// Verify matrix is visible with seed training types
		await expect(trainingPage.trainingMatrix).toBeVisible();
		await expect(trainingPage.trainingMatrix.getByText('Weapons Qualification').first()).toBeVisible();
		await expect(trainingPage.trainingMatrix.getByText('First Aid').first()).toBeVisible();
	});

	test('add a training record', async ({ ownerPage, orgId }) => {
		trainingPage = new TrainingPage(ownerPage);
		await trainingPage.goto(orgId);

		await trainingPage.addRecord('Doe', 'Weapons Qualification');

		// Verify the training matrix still shows the training type
		await trainingPage.expectRecordVisible('Doe', 'Weapons Qualification');
	});
});

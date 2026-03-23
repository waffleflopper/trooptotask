import { test, expect } from '../fixtures/auth';
import { adminClient } from '../fixtures/supabase';
import { TEST_ORG, TEST_PERSONNEL } from '../fixtures/test-data';
import { OnboardingPage } from '../pages/OnboardingPage';

const TEMPLATE_ID = '00000000-e2e0-7e57-0000-000000000040';
const STEP_IDS = {
	checkbox: '00000000-e2e0-7e57-0000-000000000041',
	paperwork: '00000000-e2e0-7e57-0000-000000000042'
};

test.describe('Onboarding', () => {
	// Seed template + steps before tests, clean up after
	test.beforeAll(async () => {
		// Clean up any leftover onboarding data
		await adminClient.from('onboarding_step_progress').delete().neq('id', '00000000-0000-0000-0000-000000000000');
		await adminClient.from('personnel_onboardings').delete().eq('organization_id', TEST_ORG.id);
		await adminClient.from('onboarding_template_steps').delete().eq('organization_id', TEST_ORG.id);
		await adminClient.from('onboarding_templates').delete().eq('organization_id', TEST_ORG.id);

		// Create template
		const { error: tmplError } = await adminClient.from('onboarding_templates').insert({
			id: TEMPLATE_ID,
			organization_id: TEST_ORG.id,
			name: 'E2E Test Template'
		});
		if (tmplError) throw new Error(`Failed to seed template: ${tmplError.message}`);

		// Create template steps
		const { error: stepsError } = await adminClient.from('onboarding_template_steps').insert([
			{
				id: STEP_IDS.checkbox,
				template_id: TEMPLATE_ID,
				organization_id: TEST_ORG.id,
				name: 'Get ID Card',
				step_type: 'checkbox',
				sort_order: 0
			},
			{
				id: STEP_IDS.paperwork,
				template_id: TEMPLATE_ID,
				organization_id: TEST_ORG.id,
				name: 'Security Clearance',
				step_type: 'paperwork',
				stages: ['submitted', 'under review', 'approved'],
				sort_order: 1
			}
		]);
		if (stepsError) throw new Error(`Failed to seed steps: ${stepsError.message}`);
	});

	test.afterAll(async () => {
		await adminClient.from('onboarding_step_progress').delete().neq('id', '00000000-0000-0000-0000-000000000000');
		await adminClient.from('personnel_onboardings').delete().eq('organization_id', TEST_ORG.id);
		await adminClient.from('onboarding_template_steps').delete().eq('organization_id', TEST_ORG.id);
		await adminClient.from('onboarding_templates').delete().eq('organization_id', TEST_ORG.id);
	});

	test('start onboarding and toggle checkbox step', async ({ ownerPage, orgId }) => {
		const onboarding = new OnboardingPage(ownerPage);
		await onboarding.goto(orgId);

		// Start onboarding for John Doe
		await onboarding.openStartModal();
		await onboarding.selectPerson('Doe');
		await onboarding.confirmStart();

		// Verify onboarding appears in list
		await onboarding.expectOnboardingVisible('Doe');

		// Expand to see steps
		await onboarding.expandOnboarding('Doe');

		// Verify steps are visible
		await expect(ownerPage.getByText('Get ID Card').first()).toBeVisible({ timeout: 5000 });
		await expect(ownerPage.getByText('Security Clearance').first()).toBeVisible({ timeout: 5000 });

		// Toggle the checkbox step
		await onboarding.toggleCheckbox('Get ID Card');
		await onboarding.expectStepChecked('Get ID Card');
	});

	test('cannot start second onboarding for same soldier', async ({ ownerPage, orgId }) => {
		const onboarding = new OnboardingPage(ownerPage);
		await onboarding.goto(orgId);

		// John Doe should already have an active onboarding from previous test
		// The start modal should filter him out
		await onboarding.openStartModal();

		// Doe should not be in the available personnel list
		// Open the SearchSelect dropdown
		const trigger = ownerPage.getByRole('button', { name: /Search for a person/i });
		await trigger.click();

		const combobox = ownerPage.getByRole('combobox');
		await combobox.waitFor({ state: 'visible', timeout: 5000 });
		await combobox.fill('Doe');

		// The dropdown should show "No matches" or not show Doe as an option
		await ownerPage.waitForTimeout(500);
		const doeOption = ownerPage.getByRole('option', { name: /Doe/ });
		await expect(doeOption).not.toBeVisible();
	});
});

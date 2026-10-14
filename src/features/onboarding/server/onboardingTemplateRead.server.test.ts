import { describe, it, expect } from 'vitest';
import { createQueryPortsContext } from '$features/onboarding/server/onboardingPersistence.test-support.server';
import { fetchOnboardingTemplateActivity, fetchOnboardingTemplatesData } from './onboardingTemplateRead.server';

describe('fetchOnboardingTemplatesData', () => {
	it('returns templates and templateSteps from the store', async () => {
		const ctx = createQueryPortsContext();
		ctx.store.seed('onboarding_templates', [
			{ id: 'tmpl-1', name: 'Basic Checklist', organization_id: 'test-org' },
			{ id: 'tmpl-2', name: 'Advanced Checklist', organization_id: 'test-org' }
		]);
		ctx.store.seed('onboarding_template_steps', [
			{ id: 'step-1', template_id: 'tmpl-1', title: 'Step A', sort_order: 0, organization_id: 'test-org' },
			{ id: 'step-2', template_id: 'tmpl-1', title: 'Step B', sort_order: 1, organization_id: 'test-org' }
		]);

		const result = await fetchOnboardingTemplatesData(ctx);

		expect(result.templates).toHaveLength(2);
		expect(result.templateSteps).toHaveLength(2);
	});

	it('returns empty arrays when no data exists', async () => {
		const ctx = createQueryPortsContext();

		const result = await fetchOnboardingTemplatesData(ctx);

		expect(result.templates).toEqual([]);
		expect(result.templateSteps).toEqual([]);
	});
});

describe('fetchOnboardingTemplateActivity', () => {
	it('counts in-progress packets per template, including templates with none', async () => {
		const ctx = createQueryPortsContext();
		ctx.store.seed('onboarding_templates', [
			{ id: 'tmpl-1', name: 'Basic Checklist', organization_id: 'test-org' },
			{ id: 'tmpl-2', name: 'Advanced Checklist', organization_id: 'test-org' }
		]);
		ctx.store.seed('personnel_onboardings', [
			{ id: 'p1', template_id: 'tmpl-1', status: 'in_progress', organization_id: 'test-org' },
			{ id: 'p2', template_id: 'tmpl-1', status: 'in_progress', organization_id: 'test-org' },
			{ id: 'p3', template_id: 'tmpl-1', status: 'completed', organization_id: 'test-org' }
		]);

		expect(await fetchOnboardingTemplateActivity(ctx)).toEqual({ 'tmpl-1': 2, 'tmpl-2': 0 });
	});
});

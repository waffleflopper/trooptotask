import { describe, it, expect } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { fetchOnboardingTemplatesData } from './onboardingTemplatesQuery';

describe('fetchOnboardingTemplatesData', () => {
	it('returns templates and templateSteps from the store', async () => {
		const ctx = createTestContext();
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
		const ctx = createTestContext();

		const result = await fetchOnboardingTemplatesData(ctx);

		expect(result.templates).toEqual([]);
		expect(result.templateSteps).toEqual([]);
	});
});

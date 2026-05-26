import { describe, expect, it } from 'vitest';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const TEMPLATE_ID = '00000000-0000-4000-a000-000000000001';

const operateOnlyCapabilityMap: CapabilityMap = {
	calendar: 'none',
	personnel: 'view',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'operate',
	ratingScheme: 'none'
};

describe('POST /api/onboarding-templates/[templateId]/duplicate', () => {
	it('uses a policy-first route config for template duplication', () => {
		expect('permission' in _postConfig).toBe(false);
	});

	it('duplicates a template through the route config', async () => {
		const ctx = createTestContext();
		ctx.store.seed('onboarding_templates', [
			{ id: TEMPLATE_ID, name: 'Standard Arrival', organization_id: 'test-org' }
		]);
		ctx.store.seed('onboarding_template_steps', [
			{
				id: 'step-1',
				template_id: TEMPLATE_ID,
				name: 'Initial Counseling',
				step_type: 'checkbox',
				sort_order: 0,
				organization_id: 'test-org'
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, { templateId: TEMPLATE_ID });

		expect(result).toMatchObject({
			template: { name: 'Standard Arrival Copy' },
			templateSteps: [expect.objectContaining({ name: 'Initial Counseling', sortOrder: 0 })]
		});
	});

	it('uses the route template id as the duplication input', async () => {
		const input = await _postConfig.parseInput?.({
			params: { templateId: TEMPLATE_ID }
		} as Parameters<NonNullable<typeof _postConfig.parseInput>>[0]);

		expect(input).toEqual({ templateId: TEMPLATE_ID });
	});

	it('rejects duplication without Onboarding configure policy', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: operateOnlyCapabilityMap
			}
		});

		await expect(handleUseCaseRequest(_postConfig, ctx, { templateId: TEMPLATE_ID })).rejects.toMatchObject({
			status: 403
		});
	});

	it('blocks duplication in read-only mode', async () => {
		const ctx = createTestContext({ readOnly: true });

		await expect(handleUseCaseRequest(_postConfig, ctx, { templateId: TEMPLATE_ID })).rejects.toMatchObject({
			status: 403
		});
	});
});

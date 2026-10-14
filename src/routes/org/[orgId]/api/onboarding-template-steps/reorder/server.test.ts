import { describe, expect, it } from 'vitest';
import { createTestContext } from '$features/onboarding/server/onboardingPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const TEMPLATE_ID = '00000000-0000-4000-a000-000000000001';
const FIRST = '00000000-0000-4000-a000-000000000101';
const SECOND = '00000000-0000-4000-a000-000000000102';

function orderedTemplate() {
	const ctx = createTestContext();
	ctx.store.seed('onboarding_templates', [{ id: TEMPLATE_ID, name: 'Arrival', organization_id: 'test-org' }]);
	ctx.store.seed('onboarding_template_steps', [
		{ id: FIRST, template_id: TEMPLATE_ID, name: 'First', sort_order: 0, organization_id: 'test-org' },
		{ id: SECOND, template_id: TEMPLATE_ID, name: 'Second', sort_order: 1, organization_id: 'test-org' }
	]);
	return ctx;
}

async function savedOrder(ctx: ReturnType<typeof createTestContext>) {
	return (await ctx.onboardingCatalog.listSteps(TEMPLATE_ID)).map((step) => step.name);
}

describe('POST /api/onboarding-template-steps/reorder', () => {
	it('saves the requested order', async () => {
		const ctx = orderedTemplate();

		await handleUseCaseRequest(
			_postConfig,
			ctx,
			{ templateId: TEMPLATE_ID, orderedStepIds: [SECOND, FIRST] },
			() => ctx
		);

		expect(await savedOrder(ctx)).toEqual(['Second', 'First']);
	});

	it.each([
		['template id', { templateId: 'arrival', orderedStepIds: [SECOND, FIRST] }, 'Invalid template ID'],
		['step id', { templateId: TEMPLATE_ID, orderedStepIds: [SECOND, 'first'] }, 'Invalid step ID'],
		['step list', { templateId: TEMPLATE_ID, orderedStepIds: SECOND }, 'expected array']
	])('rejects a malformed %s with a 400 and keeps the saved order', async (_field, input, message) => {
		const ctx = orderedTemplate();

		await expect(handleUseCaseRequest(_postConfig, ctx, input, () => ctx)).rejects.toMatchObject({
			status: 400,
			message: expect.stringContaining(message)
		});
		expect(await savedOrder(ctx)).toEqual(['First', 'Second']);
		expect(ctx.audit.events).toEqual([]);
	});
});

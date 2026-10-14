import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { createTestContext } from '$features/onboarding/server/onboardingPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const TEMPLATE_ID = '00000000-0000-4000-a000-000000000001';
const REQUEST_ID = '00000000-0000-4000-a000-000000009001';
type DuplicateEvent = Parameters<NonNullable<typeof _postConfig.parseInput>>[0];

function duplicateEvent(body: string, templateId = TEMPLATE_ID) {
	return {
		params: { templateId },
		request: new Request('http://localhost/duplicate', { method: 'POST', body })
	} as unknown as DuplicateEvent;
}

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
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.onboarding.configureWorkflows);
		expect(_postConfig.policyResource).toEqual({ kind: 'organization' });
		expect(_postConfig.mutation).toBe(true);
	});

	it('duplicates once per request id and answers a repeat with the same copy', async () => {
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
		const input = { templateId: TEMPLATE_ID, requestId: REQUEST_ID };

		const result = await handleUseCaseRequest(_postConfig, ctx, input, () => ctx);
		const replay = await handleUseCaseRequest(_postConfig, ctx, input, () => ctx);

		expect(result).toMatchObject({
			template: { name: 'Standard Arrival Copy' },
			templateSteps: [expect.objectContaining({ name: 'Initial Counseling', sortOrder: 0 })]
		});
		expect(replay).toEqual(result);
		expect(ctx.audit.events.map((event) => event.action)).toEqual(['onboarding_template.duplicated']);
	});

	it('reads the template from the route and the request id from the body', async () => {
		await expect(_postConfig.parseInput(duplicateEvent(JSON.stringify({ requestId: REQUEST_ID })))).resolves.toEqual({
			templateId: TEMPLATE_ID,
			requestId: REQUEST_ID
		});
		await expect(_postConfig.parseInput(duplicateEvent('{'))).rejects.toMatchObject({
			status: 400,
			message: 'Invalid JSON in request body'
		});
	});

	it.each([
		['no body', '', TEMPLATE_ID, 'Invalid JSON in request body'],
		['no request id', '{}', TEMPLATE_ID, 'Duplicate needs a request ID'],
		['a malformed request id', JSON.stringify({ requestId: 'retry-1' }), TEMPLATE_ID, 'Duplicate needs a request ID'],
		['a numeric request id', JSON.stringify({ requestId: 7 }), TEMPLATE_ID, 'Duplicate needs a request ID'],
		['a malformed template id', JSON.stringify({ requestId: REQUEST_ID }), 'not-a-template', 'Invalid template ID']
	])('rejects %s with a 400 and copies nothing', async (_case, body, templateId, message) => {
		const ctx = createTestContext();
		ctx.store.seed('onboarding_templates', [
			{ id: TEMPLATE_ID, name: 'Standard Arrival', organization_id: 'test-org' }
		]);
		const duplicate = async () =>
			handleUseCaseRequest(_postConfig, ctx, await _postConfig.parseInput(duplicateEvent(body, templateId)), () => ctx);

		await expect(duplicate()).rejects.toMatchObject({ status: 400, message });
		expect(await ctx.store.findMany('onboarding_templates', 'test-org')).toHaveLength(1);
		expect(ctx.audit.events).toEqual([]);
	});

	it('rejects duplication without Onboarding configure policy', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: operateOnlyCapabilityMap
			}
		});

		await expect(
			handleUseCaseRequest(_postConfig, ctx, { templateId: TEMPLATE_ID, requestId: REQUEST_ID }, () => ctx)
		).rejects.toMatchObject({ status: 403 });
	});
});

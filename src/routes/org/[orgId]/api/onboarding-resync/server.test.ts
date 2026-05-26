import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

function seedResyncFixtures(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel_onboardings', [
		{
			id: 'ob-1',
			personnel_id: 'p-1',
			template_id: 'tmpl-1',
			status: 'in_progress',
			started_at: '2026-01-01T00:00:00Z',
			completed_at: null,
			cancelled_at: null,
			organization_id: 'test-org'
		}
	]);
	ctx.store.seed('onboarding_template_steps', [
		{
			id: 'ts-1',
			template_id: 'tmpl-1',
			name: 'Get ID card',
			description: 'Visit badge office',
			step_type: 'checkbox',
			training_type_id: null,
			stages: null,
			sort_order: 0,
			organization_id: 'test-org'
		}
	]);
	ctx.store.seed('onboarding_step_progress', [
		{
			id: 'sp-1',
			onboarding_id: 'ob-1',
			template_step_id: 'ts-old',
			step_name: 'Old step',
			step_type: 'checkbox',
			training_type_id: null,
			stages: null,
			sort_order: 0,
			completed: false,
			current_stage: null,
			notes: [],
			active: true,
			organization_id: 'test-org'
		}
	]);
}

describe('/api/onboarding-resync route config', () => {
	it('uses a policy-first route config for onboarding resync', () => {
		expect('permission' in _postConfig).toBe(false);
		expect('deferPolicyToUseCase' in _postConfig).toBe(false);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.onboarding.configureWorkflows);
		expect(_postConfig.policyResource).toEqual({ kind: 'unscoped' });
	});

	it('allows onboarding configurators to resync through the policy decision', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'configure',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedResyncFixtures(ctx);

		const result = (await handleUseCaseRequest(_postConfig, ctx, { onboardingId: 'ob-1' })) as {
			steps: Array<{ templateStepId: string; active: boolean }>;
		};

		expect(result.steps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ templateStepId: 'ts-1', active: true }),
				expect.objectContaining({ templateStepId: 'ts-old', active: false })
			])
		);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'onboarding.resynced',
				resourceId: 'ob-1'
			})
		);
	});

	it('denies onboarding resync before use-case execution when configure policy is missing', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'operate',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(handleUseCaseRequest(_postConfig, ctx, { onboardingId: 'ob-1' })).rejects.toMatchObject({
			status: 403
		});
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'onboarding.configureWorkflows'
			})
		]);
	});
});

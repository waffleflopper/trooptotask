import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$features/onboarding/server/onboardingPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const ONBOARDING_ID = '00000000-0000-4000-8000-000000000010';
const PERSON_1 = '00000000-0000-4000-8000-000000000011';
const TEMPLATE_1 = '00000000-0000-4000-8000-000000000012';
const OLD_TEMPLATE_STEP = '00000000-0000-4000-8000-000000000013';
const SAVED_STEP = '00000000-0000-4000-8000-000000000014';

function seedResyncFixtures(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel_onboardings', [
		{
			id: ONBOARDING_ID,
			personnel_id: PERSON_1,
			template_id: TEMPLATE_1,
			status: 'in_progress',
			started_at: '2026-01-01T00:00:00Z',
			completed_at: null,
			cancelled_at: null,
			organization_id: 'test-org'
		}
	]);
}

describe('/api/onboarding-resync route config', () => {
	it('uses a policy-first route config for onboarding resync', () => {
		expect('permission' in _postConfig).toBe(false);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.onboarding.configureWorkflows);
		expect(_postConfig.policyResource).toEqual({ kind: 'unscoped' });
	});

	it('allows onboarding configurators to resync through the policy decision', async () => {
		const ctx = createTestContext({
			onboardingReconciliation: {
				async reconcile() {
					return {
						onboarding_id: ONBOARDING_ID,
						template_id: TEMPLATE_1,
						old_template_id: TEMPLATE_1,
						steps: [
							{
								id: SAVED_STEP,
								onboarding_id: ONBOARDING_ID,
								template_step_id: OLD_TEMPLATE_STEP,
								step_name: 'Old step',
								step_type: 'checkbox',
								training_type_id: null,
								stages: null,
								sort_order: 0,
								completed: false,
								current_stage: null,
								notes: [],
								active: false,
								progress_changed_at: '2026-09-01T12:00:00.000Z'
							}
						]
					};
				}
			},
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

		const result = (await handleUseCaseRequest(_postConfig, ctx, { onboardingId: ONBOARDING_ID }, () => ctx)) as {
			steps: Array<{ templateStepId: string; active: boolean }>;
		};

		expect(result.steps).toEqual(
			expect.arrayContaining([expect.objectContaining({ templateStepId: OLD_TEMPLATE_STEP, active: false })])
		);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'onboarding.resynced',
				resourceId: ONBOARDING_ID
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

		await expect(
			handleUseCaseRequest(_postConfig, ctx, { onboardingId: ONBOARDING_ID }, () => ctx)
		).rejects.toMatchObject({
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

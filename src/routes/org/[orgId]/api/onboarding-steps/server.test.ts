import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _putConfig } from './+server';

function seedOnboardingStep(
	ctx: ReturnType<typeof createTestContext>,
	overrides?: Partial<{
		id: string;
		onboarding_id: string;
		step_name: string;
		step_type: 'checkbox' | 'paperwork' | 'training';
		training_type_id: string | null;
		stages: string[] | null;
		sort_order: number;
		completed: boolean;
		current_stage: string | null;
		notes: Array<{ text: string; timestamp: string; userId: string }>;
		template_step_id: string;
		active: boolean;
		organization_id: string;
	}>
) {
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
	ctx.store.seed('onboarding_step_progress', [
		{
			id: 'step-1',
			onboarding_id: 'ob-1',
			step_name: 'Get ID card',
			step_type: 'checkbox',
			training_type_id: null,
			stages: null,
			sort_order: 0,
			completed: false,
			current_stage: null,
			notes: [],
			template_step_id: 'ts-1',
			active: true,
			organization_id: 'test-org',
			...overrides
		}
	]);
}

describe('/api/onboarding-steps route config', () => {
	it('uses policy-first route configs for onboarding step mutations', () => {
		for (const config of [_putConfig, _deleteConfig]) {
			expect('permission' in config).toBe(false);
			expect(config.policyAction).toBe(POLICY_ACTION_CATALOG.onboarding.manageWorkflows);
			expect(config.policyResource).toEqual({ kind: 'unscoped' });
		}
	});

	it('allows onboarding operators to toggle step progress through the policy decision', async () => {
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
		seedOnboardingStep(ctx);

		const result = await handleUseCaseRequest(_putConfig, ctx, {
			action: 'toggleCheckbox',
			stepId: 'step-1',
			completed: true
		});

		expect(result).toMatchObject({
			id: 'step-1',
			completed: true
		});
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'onboarding_step.toggled',
				resourceId: 'step-1'
			})
		);
	});

	it('allows onboarding operators to remove inactive steps through the policy decision', async () => {
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
		seedOnboardingStep(ctx, { id: 'inactive-step-1', active: false });

		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: 'inactive-step-1' })).resolves.toEqual({
			success: true
		});
		await expect(
			ctx.store.findOne('onboarding_step_progress', ctx.auth.orgId, { id: 'inactive-step-1' })
		).resolves.toBeNull();
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'onboarding_step.inactive_removed',
				resourceId: 'inactive-step-1'
			})
		);
	});

	it('denies onboarding step mutations before use-case execution when policy is missing', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'view',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(
			handleUseCaseRequest(_putConfig, ctx, {
				action: 'toggleCheckbox',
				stepId: 'step-1',
				completed: true
			})
		).rejects.toMatchObject({ status: 403 });
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'onboarding.manageWorkflows'
			})
		]);
	});
});

import { describe, expect, it, vi } from 'vitest';
import type { OnboardingLifecycleTransitionResult } from '$features/onboarding/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig, _putConfig } from './+server';

describe('/api/onboarding route config', () => {
	it('uses policy-first route configs for onboarding lifecycle mutations', () => {
		for (const config of [_postConfig, _putConfig]) {
			expect('permission' in config).toBe(false);
			expect(config.policyAction).toBe(POLICY_ACTION_CATALOG.onboarding.manageWorkflows);
			expect(config.policyResource).toEqual({ kind: 'unscoped' });
		}
	});

	it('starts onboarding after the route-level policy decision allows the request', async () => {
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
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				group_id: null,
				archived_at: null
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			personnelId: 'p-1',
			templateId: 'template-1'
		});

		expect(result).toMatchObject({ personnelId: 'p-1', templateId: 'template-1', status: 'in_progress' });
	});

	it.each([_postConfig, _putConfig])(
		'denies onboarding lifecycle mutations before use-case execution when policy is missing',
		async (config) => {
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
				handleUseCaseRequest(config, ctx, {
					personnelId: 'p-1',
					templateId: 'template-1',
					id: 'ob-1',
					status: 'cancelled'
				})
			).rejects.toMatchObject({ status: 403 });
			expect(ctx.auditPort.events).toEqual([
				expect.objectContaining({
					action: 'policy.denied',
					resourceType: 'onboarding.manageWorkflows'
				})
			]);
		}
	);
});

const lifecycleRequests = [
	{
		status: 'cancelled',
		initialStatus: 'in_progress',
		saved: { id: 'ob-1', status: 'cancelled', cancelled_at: '2026-10-01T12:00:00.123+00:00', completed_at: null },
		response: { id: 'ob-1', status: 'cancelled', cancelledAt: '2026-10-01T12:00:00.123+00:00', completedAt: null }
	},
	{
		status: 'completed',
		initialStatus: 'in_progress',
		saved: { id: 'ob-1', status: 'completed', cancelled_at: null, completed_at: '2026-10-01' },
		response: { id: 'ob-1', status: 'completed', cancelledAt: null, completedAt: '2026-10-01', incompleteCount: 1 }
	},
	{
		status: 'in_progress',
		initialStatus: 'cancelled',
		saved: { id: 'ob-1', status: 'in_progress', cancelled_at: null, completed_at: null },
		response: { id: 'ob-1', status: 'in_progress', cancelledAt: null, completedAt: null }
	}
] as const;

function lifecycleContext(initialStatus: string, saved: OnboardingLifecycleTransitionResult | null) {
	const ctx = createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			capabilityMap: {
				calendar: 'none',
				personnel: 'none',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'operate',
				ratingScheme: 'none'
			},
			scopeSet: { kind: 'organization' }
		},
		onboardingLifecycleTransition: { transition: vi.fn().mockResolvedValue(saved) }
	});
	ctx.store.seed('personnel', [{ id: 'p-1', organization_id: ctx.auth.orgId, group_id: null, archived_at: null }]);
	ctx.store.seed('personnel_onboardings', [
		{ id: 'ob-1', personnel_id: 'p-1', organization_id: ctx.auth.orgId, status: initialStatus }
	]);
	ctx.store.seed('onboarding_step_progress', [
		{
			id: 'step-1',
			onboarding_id: 'ob-1',
			organization_id: ctx.auth.orgId,
			active: true,
			completed: false,
			step_type: 'training'
		},
		{
			id: 'step-2',
			onboarding_id: 'ob-1',
			organization_id: ctx.auth.orgId,
			active: false,
			completed: false,
			step_type: 'checkbox'
		}
	]);
	vi.spyOn(ctx.store, 'update').mockRejectedValue(new Error('Generic lifecycle write must not run'));
	return ctx;
}

describe.each(lifecycleRequests)('/api/onboarding PUT $status', ({ status, initialStatus, saved, response }) => {
	it('returns saved dates and the retained incomplete count through the unchanged endpoint body', async () => {
		const ctx = lifecycleContext(initialStatus, saved);

		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: 'ob-1', status, completedAt: '2099-12-31' })
		).resolves.toEqual(response);

		expect(ctx.auditPort.events).toEqual([expect.objectContaining({ resourceId: 'ob-1' })]);
	});

	it('propagates expectation loss as 409 without a success audit', async () => {
		const ctx = lifecycleContext(initialStatus, null);

		await expect(handleUseCaseRequest(_putConfig, ctx, { id: 'ob-1', status })).rejects.toMatchObject({ status: 409 });

		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.store.update).not.toHaveBeenCalled();
	});

	it('keeps the existing sequential invalid-transition 400', async () => {
		const ctx = lifecycleContext('completed', null);

		await expect(handleUseCaseRequest(_putConfig, ctx, { id: 'ob-1', status })).rejects.toMatchObject({ status: 400 });

		expect(ctx.onboardingLifecycleTransition!.transition).not.toHaveBeenCalled();
		expect(ctx.auditPort.events).toEqual([]);
	});
});

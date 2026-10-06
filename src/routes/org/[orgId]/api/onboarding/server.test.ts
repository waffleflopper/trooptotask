import { describe, expect, it, vi } from 'vitest';
import type { OnboardingLifecycleTransitionResult, OnboardingPacketCreationPort } from '$features/onboarding/contracts';
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
		const create = vi.fn<OnboardingPacketCreationPort['create']>().mockResolvedValue({
			onboarding: {
				id: 'saved-packet',
				personnel_id: 'p-1',
				template_id: 'template-1',
				status: 'in_progress',
				started_at: '2026-03-15',
				completed_at: null,
				cancelled_at: null
			},
			steps: []
		});
		const ctx = createTestContext({
			onboardingPacketCreation: { create },
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

		const result = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				personnelId: 'p-1',
				templateId: 'template-1',
				startedAt: '2026-03-15'
			},
			() => ctx
		);

		expect(result).toEqual({
			id: 'saved-packet',
			personnelId: 'p-1',
			templateId: 'template-1',
			status: 'in_progress',
			startedAt: '2026-03-15',
			completedAt: null,
			cancelledAt: null,
			steps: []
		});
		expect(create).toHaveBeenCalledWith(ctx.auth.orgId, {
			personnelId: 'p-1',
			templateId: 'template-1',
			startedAt: '2026-03-15',
			steps: []
		});
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({ action: 'onboarding.started', resourceId: 'saved-packet' })
		]);
	});

	it.each([
		{},
		{ templateId: null },
		{ templateId: '' },
		{ templateId: '   ' },
		{ templateId: 42 },
		{ templateId: {} }
	])('rejects malformed configured-template input %j through the actual POST config', async (body) => {
		const create = vi.fn<OnboardingPacketCreationPort['create']>();
		const ctx = createTestContext({ onboardingPacketCreation: { create } });
		ctx.store.seed('personnel', [{ id: 'p-1', organization_id: ctx.auth.orgId, group_id: null }]);
		const training = vi.spyOn(ctx.trainingOnboardingReferences, 'completedTypeIds');
		const reads = vi.spyOn(ctx.store, 'findMany');
		await expect(
			handleUseCaseRequest(_postConfig, ctx, { personnelId: 'p-1', ...body }, () => ctx)
		).rejects.toMatchObject({
			status: 400
		});
		expect(reads.mock.calls.filter(([table]) => table === 'onboarding_template_steps')).toEqual([]);
		expect(training).not.toHaveBeenCalled();
		expect(create).not.toHaveBeenCalled();
		expect(ctx.auditPort.events).toEqual([]);
	});

	it.each([403, 404, 409, 500])(
		'propagates a creation failure %s without a success audit or parent fallback',
		async (status) => {
			const failure =
				status === 500 ? new Error('Creation failed') : Object.assign(new Error('Creation rejected'), { status });
			const ctx = createTestContext({ onboardingPacketCreation: { create: vi.fn().mockRejectedValue(failure) } });
			ctx.store.seed('personnel', [{ id: 'p-1', organization_id: ctx.auth.orgId, group_id: null }]);
			const insert = vi.spyOn(ctx.store, 'insert').mockRejectedValue(new Error('Generic Start insert must not run'));
			const deleteParent = vi
				.spyOn(ctx.store, 'delete')
				.mockRejectedValue(new Error('Compensation delete must not run'));
			await expect(
				handleUseCaseRequest(_postConfig, ctx, { personnelId: 'p-1', templateId: 'template-1' }, () => ctx)
			).rejects.toBe(failure);
			expect(insert).not.toHaveBeenCalled();
			expect(deleteParent).not.toHaveBeenCalled();
			expect(ctx.auditPort.events).toEqual([]);
		}
	);

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
				handleUseCaseRequest(
					config,
					ctx,
					{
						personnelId: 'p-1',
						templateId: 'template-1',
						id: 'ob-1',
						status: 'cancelled'
					},
					() => ctx
				)
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
			handleUseCaseRequest(_putConfig, ctx, { id: 'ob-1', status, completedAt: '2099-12-31' }, () => ctx)
		).resolves.toEqual(response);

		expect(ctx.auditPort.events).toEqual([expect.objectContaining({ resourceId: 'ob-1' })]);
	});

	it('propagates expectation loss as 409 without a success audit', async () => {
		const ctx = lifecycleContext(initialStatus, null);

		await expect(handleUseCaseRequest(_putConfig, ctx, { id: 'ob-1', status }, () => ctx)).rejects.toMatchObject({
			status: 409
		});

		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.store.update).not.toHaveBeenCalled();
	});

	it('keeps the existing sequential invalid-transition 400', async () => {
		const ctx = lifecycleContext('completed', null);

		await expect(handleUseCaseRequest(_putConfig, ctx, { id: 'ob-1', status }, () => ctx)).rejects.toMatchObject({
			status: 400
		});

		expect(ctx.onboardingLifecycleTransition!.transition).not.toHaveBeenCalled();
		expect(ctx.auditPort.events).toEqual([]);
	});
});

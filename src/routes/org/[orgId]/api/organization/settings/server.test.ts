import { describe, expect, it, vi } from 'vitest';

const { buildRouteRequestMock, createRequestOrganizationPolicyContextMock } = vi.hoisted(() => ({
	buildRouteRequestMock: vi.fn(),
	createRequestOrganizationPolicyContextMock: vi.fn()
}));

vi.mock('$lib/server/adapters/requestContexts.server', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/requestContexts.server')>(
		'$lib/server/adapters/requestContexts.server'
	);
	return {
		...actual,
		buildRouteRequest: buildRouteRequestMock,
		createRequestOrganizationPolicyContext: createRequestOrganizationPolicyContextMock
	};
});

import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig, POST } from './+server';

describe('/api/organization/settings', () => {
	it('admits an Organization owner to save the training readiness goal', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [{ id: ctx.auth.orgId, training_readiness_goal_percent: 90 }]);

		await expect(
			handleUseCaseRequest(_postConfig, ctx, { trainingReadinessGoalPercent: 85 }, () => ctx)
		).resolves.toEqual({
			success: true
		});
		expect(await ctx.rawStore.findOne('organizations', ctx.auth.orgId, {})).toMatchObject({
			training_readiness_goal_percent: 85
		});
	});

	it.each([
		{ lossWarningWindowDays: 90 },
		{ trainingReadinessGoalPercent: 85 },
		{ featureSwitch: { feature: 'training', on: false } },
		{ strengthFloorPercent: 60 }
	])('denies settings updates to members with Personnel configure authority (%j)', async (body) => {
		const memberCtx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		const stored = {
			training_readiness_goal_percent: 90,
			loss_warning_window_days: 180,
			disabled_features: [],
			strength_floor_percent: 80
		};
		memberCtx.rawStore.seed('organizations', [{ id: memberCtx.auth.orgId, ...stored }]);

		await expect(handleUseCaseRequest(_postConfig, memberCtx, body, () => memberCtx)).rejects.toMatchObject({
			status: 403
		});
		expect(await memberCtx.rawStore.findOne('organizations', memberCtx.auth.orgId, {})).toMatchObject(stored);
	});

	it('returns a generic 500 when the policy write fails with provider text', async () => {
		const ctx = createTestContext();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		buildRouteRequestMock.mockResolvedValue(ctx);
		createRequestOrganizationPolicyContextMock.mockReturnValue({
			...ctx,
			organizationPolicyWrite: {
				updatePolicies: async () => ({
					status: 'failed',
					message: 'new row violates row-level security policy for table "organizations"'
				})
			}
		});

		await expect(
			POST({
				request: new Request('http://localhost/org/test-org/api/organization/settings', {
					method: 'POST',
					body: JSON.stringify({ trainingReadinessGoalPercent: 85 })
				})
			} as never)
		).rejects.toMatchObject({ status: 500, body: { message: 'Internal server error' } });
	});
});

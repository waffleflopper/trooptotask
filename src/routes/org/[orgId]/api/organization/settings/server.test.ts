import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

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

	it.each([{ lossWarningWindowDays: 90 }, { trainingReadinessGoalPercent: 85 }])(
		'denies settings updates to members with Personnel configure authority (%j)',
		async (body) => {
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

			memberCtx.rawStore.seed('organizations', [{ id: memberCtx.auth.orgId, training_readiness_goal_percent: 90 }]);

			await expect(handleUseCaseRequest(_postConfig, memberCtx, body, () => memberCtx)).rejects.toMatchObject({
				status: 403
			});
			expect(await memberCtx.rawStore.findOne('organizations', memberCtx.auth.orgId, {})).toMatchObject({
				training_readiness_goal_percent: 90
			});
		}
	);
});

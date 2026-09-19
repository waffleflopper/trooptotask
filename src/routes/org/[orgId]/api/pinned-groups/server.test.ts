import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig } from './+server';

describe('/api/pinned-groups route config', () => {
	it('uses policy-first identity preference authorization', () => {
		expect(_postConfig.policyAction?.id).toBe('identity.updateOwnPreferences');
		expect(_deleteConfig.policyAction?.id).toBe('identity.updateOwnPreferences');
		expect('permission' in _postConfig).toBe(false);
		expect('permission' in _deleteConfig).toBe(false);
	});

	it('lets viewers pin groups as a user preference without calendar edit access', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				userId: 'user-1',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		await handleUseCaseRequest(_postConfig, ctx, { groupName: 'Alpha', sortOrder: 0 });

		const stored = await ctx.store.findMany('user_pinned_groups', ctx.auth.orgId);
		expect(stored).toMatchObject([{ user_id: 'user-1', group_name: 'Alpha', sort_order: 0 }]);
	});

	it('lets viewers unpin groups as a user preference', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				userId: 'user-1',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		ctx.store.seed('user_pinned_groups', [
			{
				id: 'pin-1',
				organization_id: ctx.auth.orgId,
				user_id: 'user-1',
				group_name: 'Alpha',
				sort_order: 0
			}
		]);

		await handleUseCaseRequest(_deleteConfig, ctx, { groupName: 'Alpha' });

		const stored = await ctx.store.findMany('user_pinned_groups', ctx.auth.orgId);
		expect(stored).toEqual([]);
	});
});

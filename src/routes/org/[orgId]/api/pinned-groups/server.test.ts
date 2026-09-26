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

		const result = await handleUseCaseRequest(_postConfig, ctx, { groupName: 'Alpha', sortOrder: 0 });

		const stored = await ctx.store.findMany('user_pinned_groups', ctx.auth.orgId);
		expect(stored).toMatchObject([{ user_id: 'user-1', group_name: 'Alpha', sort_order: 0 }]);
		expect(result).toMatchObject({ id: expect.any(String), groupName: 'Alpha', sortOrder: 0 });
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({ action: 'pinned_group.created', resourceType: 'pinned_group' })
		);
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
			},
			{ id: 'other-user', organization_id: ctx.auth.orgId, user_id: 'user-2', group_name: 'Alpha', sort_order: 0 },
			{ id: 'other-org', organization_id: 'other-org', user_id: 'user-1', group_name: 'Alpha', sort_order: 0 }
		]);

		const result = await handleUseCaseRequest(_deleteConfig, ctx, { groupName: 'Alpha' });

		const stored = await ctx.store.findMany('user_pinned_groups', ctx.auth.orgId);
		expect(result).toEqual({ success: true });
		expect(stored).toMatchObject([{ id: 'other-user', user_id: 'user-2', group_name: 'Alpha' }]);
		expect(await ctx.store.findMany('user_pinned_groups', 'other-org')).toMatchObject([
			{ id: 'other-org', user_id: 'user-1', group_name: 'Alpha' }
		]);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({ action: 'pinned_group.deleted', resourceType: 'pinned_group' })
		);
	});

	it('replaces only the current user and Organization pins in requested order', async () => {
		const ctx = createTestContext({ auth: { userId: 'user-1' } });
		ctx.store.seed('user_pinned_groups', [
			{ id: 'old', organization_id: ctx.auth.orgId, user_id: 'user-1', group_name: 'Old', sort_order: 0 },
			{ id: 'other-user', organization_id: ctx.auth.orgId, user_id: 'user-2', group_name: 'Other', sort_order: 0 },
			{ id: 'other-org', organization_id: 'other-org', user_id: 'user-1', group_name: 'Remote', sort_order: 0 }
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			action: 'replace',
			groups: ['Bravo', 'Alpha']
		});

		expect(result).toEqual({ success: true, groups: ['Bravo', 'Alpha'] });
		expect(await ctx.store.findMany('user_pinned_groups', ctx.auth.orgId, { user_id: 'user-1' })).toMatchObject([
			{ group_name: 'Bravo', sort_order: 0 },
			{ group_name: 'Alpha', sort_order: 1 }
		]);
		expect(await ctx.store.findMany('user_pinned_groups', ctx.auth.orgId, { user_id: 'user-2' })).toMatchObject([
			{ id: 'other-user', group_name: 'Other' }
		]);
		expect(await ctx.store.findMany('user_pinned_groups', 'other-org')).toMatchObject([
			{ id: 'other-org', user_id: 'user-1', group_name: 'Remote' }
		]);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({ action: 'pinned_group.replaced', resourceType: 'pinned_group' })
		);
	});

	it('denies a preference write without an authenticated user', async () => {
		const ctx = createTestContext({ auth: { userId: '' } });

		await expect(handleUseCaseRequest(_postConfig, ctx, { groupName: 'Alpha' })).rejects.toMatchObject({
			status: 403
		});
		expect(await ctx.store.findMany('user_pinned_groups', ctx.auth.orgId)).toEqual([]);
	});
});

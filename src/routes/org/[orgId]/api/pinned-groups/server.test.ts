import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import type { GroupCoverage } from '$lib/access/memberAccessShape';
import { _deleteConfig, _postConfig } from './+server';

describe('/api/pinned-groups route config', () => {
	it('uses policy-first identity preference authorization', () => {
		expect(_postConfig.policyAction?.id).toBe('identity.updateOwnPreferences');
		expect(_deleteConfig.policyAction?.id).toBe('identity.updateOwnPreferences');
		expect('permission' in _postConfig).toBe(false);
		expect('permission' in _deleteConfig).toBe(false);
	});

	const viewer = (scopeSet: GroupCoverage) =>
		createTestContext({
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
				scopeSet
			}
		});

	it('lets Organization-wide viewers pin a Group by id without calendar edit access', async () => {
		const ctx = viewer({ kind: 'organization' });

		const result = await handleUseCaseRequest(_postConfig, ctx, { groupId: 'group-alpha', sortOrder: 0 }, () => ctx);

		const stored = await ctx.store.findMany('user_pinned_groups', ctx.auth.orgId);
		expect(stored).toMatchObject([{ user_id: 'user-1', group_id: 'group-alpha', sort_order: 0 }]);
		expect(result).toMatchObject({ id: expect.any(String), groupId: 'group-alpha', sortOrder: 0 });
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({ action: 'pinned_group.created', resourceType: 'pinned_group' })
		);
	});

	it('unpins only the current user and Organization pin for that Group', async () => {
		const ctx = viewer({ kind: 'organization' });
		ctx.store.seed('user_pinned_groups', [
			{ id: 'pin-1', organization_id: ctx.auth.orgId, user_id: 'user-1', group_id: 'group-alpha', sort_order: 0 },
			{ id: 'other-user', organization_id: ctx.auth.orgId, user_id: 'user-2', group_id: 'group-alpha', sort_order: 0 },
			{ id: 'other-org', organization_id: 'other-org', user_id: 'user-1', group_id: 'group-alpha', sort_order: 0 }
		]);

		const result = await handleUseCaseRequest(_deleteConfig, ctx, { groupId: 'group-alpha' }, () => ctx);

		expect(result).toEqual({ success: true });
		expect(await ctx.store.findMany('user_pinned_groups', ctx.auth.orgId)).toMatchObject([{ id: 'other-user' }]);
		expect(await ctx.store.findMany('user_pinned_groups', 'other-org')).toMatchObject([{ id: 'other-org' }]);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({ action: 'pinned_group.deleted', resourceType: 'pinned_group' })
		);
	});

	it('refuses pin writes from a Group-scoped reader and keeps their saved pins', async () => {
		const ctx = viewer(groupCoverageForTest({ kind: 'groups', groupIds: ['group-alpha'] }));
		ctx.store.seed('user_pinned_groups', [
			{ id: 'saved', organization_id: ctx.auth.orgId, user_id: 'user-1', group_id: 'group-alpha', sort_order: 0 }
		]);

		await expect(handleUseCaseRequest(_postConfig, ctx, { groupId: 'group-bravo' }, () => ctx)).rejects.toMatchObject({
			status: 403
		});
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { groupId: 'group-alpha' }, () => ctx)).rejects.toMatchObject(
			{ status: 403 }
		);
		expect(await ctx.store.findMany('user_pinned_groups', ctx.auth.orgId)).toMatchObject([
			{ id: 'saved', group_id: 'group-alpha' }
		]);
	});

	it('rejects malformed pin commands with 400 and keeps the saved pins', async () => {
		const ctx = createTestContext({ auth: { userId: 'user-1' } });
		ctx.store.seed('user_pinned_groups', [
			{ id: 'saved', organization_id: ctx.auth.orgId, user_id: 'user-1', group_id: 'group-alpha', sort_order: 0 }
		]);

		for (const body of [{}, { groupId: 5 }, { groupId: '' }, { groupId: 'group-bravo', sortOrder: 'first' }]) {
			await expect(handleUseCaseRequest(_postConfig, ctx, body, () => ctx)).rejects.toMatchObject({ status: 400 });
		}
		await expect(handleUseCaseRequest(_deleteConfig, ctx, {}, () => ctx)).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('user_pinned_groups', ctx.auth.orgId)).toMatchObject([
			{ id: 'saved', group_id: 'group-alpha' }
		]);
	});

	it('denies a preference write without an authenticated user', async () => {
		const ctx = createTestContext({ auth: { userId: '' } });

		await expect(handleUseCaseRequest(_postConfig, ctx, { groupId: 'group-alpha' }, () => ctx)).rejects.toMatchObject({
			status: 403
		});
		expect(await ctx.store.findMany('user_pinned_groups', ctx.auth.orgId)).toEqual([]);
	});
});

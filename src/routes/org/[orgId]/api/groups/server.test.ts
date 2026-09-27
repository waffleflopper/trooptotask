import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig, _putConfig } from './+server';

const groupId = '11111111-1111-4111-8111-111111111111';

describe('/api/groups', () => {
	it('creates, updates and deletes Groups with the existing JSON and audit contract', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'configure',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		const created = await handleUseCaseRequest(_postConfig, ctx, { name: 'Alpha' });
		expect(created).toMatchObject({ id: expect.any(String), name: 'Alpha', sortOrder: 0 });
		expect(await ctx.store.findMany('groups', ctx.auth.orgId)).toMatchObject([
			{ organization_id: ctx.auth.orgId, name: 'Alpha', sort_order: 0 }
		]);

		ctx.store.seed('groups', [
			{ id: groupId, organization_id: ctx.auth.orgId, name: 'Before', sort_order: 1 },
			{ id: groupId, organization_id: 'other-org', name: 'Other', sort_order: 1 }
		]);
		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: groupId, name: 'After', sortOrder: 2 })
		).resolves.toMatchObject({
			id: groupId,
			name: 'After',
			sortOrder: 2
		});
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: groupId })).resolves.toEqual({ success: true });
		expect(await ctx.store.findOne('groups', ctx.auth.orgId, { id: groupId })).toBeNull();
		expect(await ctx.store.findOne('groups', 'other-org', { id: groupId })).toMatchObject({ name: 'Other' });
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({ action: 'group.created', resourceType: 'group', resourceId: expect.any(String) }),
			expect.objectContaining({ action: 'group.updated', resourceType: 'group', resourceId: groupId }),
			expect.objectContaining({ action: 'group.deleted', resourceType: 'group', resourceId: groupId })
		]);
	});

	it('rejects invalid names, order and delete IDs without a Group write', async () => {
		const ctx = createTestContext();
		for (const request of [
			() => handleUseCaseRequest(_postConfig, ctx, { name: '' }),
			() => handleUseCaseRequest(_postConfig, ctx, { name: 'A', sortOrder: 1.5 }),
			() => handleUseCaseRequest(_putConfig, ctx, { id: groupId, name: 'B'.repeat(101) }),
			() => handleUseCaseRequest(_deleteConfig, ctx, {}),
			() => handleUseCaseRequest(_deleteConfig, ctx, { id: 'not-a-uuid' })
		]) {
			await expect(request()).rejects.toMatchObject({ status: 400 });
		}
		expect(await ctx.store.findMany('groups', ctx.auth.orgId)).toEqual([]);
	});

	it('denies Group mutations to a Personnel viewer', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
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
		for (const run of [
			() => handleUseCaseRequest(_postConfig, ctx, { id: groupId, name: 'Denied' }),
			() => handleUseCaseRequest(_putConfig, ctx, { id: groupId, name: 'Denied' }),
			() => handleUseCaseRequest(_deleteConfig, ctx, { id: groupId, name: 'Denied' })
		]) {
			await expect(run()).rejects.toMatchObject({
				status: 403
			});
		}
		expect(await ctx.store.findMany('groups', ctx.auth.orgId)).toEqual([]);
	});
});

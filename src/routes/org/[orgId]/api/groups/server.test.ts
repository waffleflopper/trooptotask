import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _getConfig, _postConfig, _putConfig } from './+server';

const groupId = '11111111-1111-4111-8111-111111111111';
const otherGroupId = '33333333-3333-4333-8333-333333333333';
const memberId = '44444444-4444-4444-8444-444444444444';
const archivedId = '55555555-5555-4555-8555-555555555555';

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
		const created = await handleUseCaseRequest(_postConfig, ctx, { name: 'Alpha' }, () => ctx);
		expect(created).toMatchObject({ id: expect.any(String), name: 'Alpha', sortOrder: 0 });
		expect(await ctx.store.findMany('groups', ctx.auth.orgId)).toMatchObject([
			{ organization_id: ctx.auth.orgId, name: 'Alpha', sort_order: 0 }
		]);

		ctx.store.seed('groups', [
			{ id: groupId, organization_id: ctx.auth.orgId, name: 'Before', sort_order: 1 },
			{ id: groupId, organization_id: 'other-org', name: 'Other', sort_order: 1 }
		]);
		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: groupId, name: '  After  ' }, () => ctx)
		).resolves.toMatchObject({
			id: groupId,
			name: 'After',
			sortOrder: 1
		});
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: groupId }, () => ctx)).resolves.toEqual({
			movedCount: 0
		});
		expect(await ctx.store.findOne('groups', ctx.auth.orgId, { id: groupId })).toBeNull();
		expect(await ctx.store.findOne('groups', 'other-org', { id: groupId })).toMatchObject({ name: 'Other' });
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({ action: 'group.created', resourceType: 'group', resourceId: expect.any(String) }),
			expect.objectContaining({ action: 'group.updated', resourceType: 'group', resourceId: groupId }),
			expect.objectContaining({ action: 'group.deleted', resourceType: 'group', resourceId: groupId })
		]);
	});

	it('deletes a Group after moving its members, active and archived, to the chosen Group', async () => {
		const ctx = createTestContext();
		const orgId = ctx.auth.orgId;
		ctx.store.seed('groups', [
			{ id: groupId, organization_id: orgId, name: 'Alpha', sort_order: 0 },
			{ id: otherGroupId, organization_id: orgId, name: 'Bravo', sort_order: 1 }
		]);
		ctx.store.seed('personnel', [
			{ id: memberId, organization_id: orgId, last_name: 'Able', group_id: groupId, archived_at: null },
			{
				id: archivedId,
				organization_id: orgId,
				last_name: 'Baker',
				group_id: groupId,
				archived_at: '2026-01-01T00:00:00Z'
			}
		]);

		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { id: groupId, moveMembersTo: groupId }, () => ctx)
		).rejects.toMatchObject({ status: 400 });
		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { id: groupId, moveMembersTo: otherGroupId }, () => ctx)
		).resolves.toEqual({ movedCount: 2 });
		await expect(handleUseCaseRequest(_getConfig, ctx, undefined, () => ctx)).resolves.toEqual([
			{ id: otherGroupId, name: 'Bravo', sortOrder: 1 }
		]);
		expect(await ctx.store.findMany('personnel', orgId)).toMatchObject([
			{ id: memberId, group_id: otherGroupId },
			{ id: archivedId, group_id: otherGroupId }
		]);
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'group.deleted',
				resourceId: groupId,
				details: { moveMembersTo: otherGroupId, movedCount: 2 }
			})
		]);
	});

	it('rejects invalid names, order and delete IDs without a Group write', async () => {
		const ctx = createTestContext();
		for (const request of [
			() => handleUseCaseRequest(_postConfig, ctx, { name: '' }, () => ctx),
			() => handleUseCaseRequest(_postConfig, ctx, { name: 'A', sortOrder: 1.5 }, () => ctx),
			() => handleUseCaseRequest(_putConfig, ctx, { id: groupId, name: 'B'.repeat(101) }, () => ctx),
			() => handleUseCaseRequest(_deleteConfig, ctx, {}, () => ctx),
			() => handleUseCaseRequest(_deleteConfig, ctx, { id: 'not-a-uuid' }, () => ctx)
		]) {
			await expect(request()).rejects.toMatchObject({ status: 400 });
		}
		expect(await ctx.store.findMany('groups', ctx.auth.orgId)).toEqual([]);
	});

	it('answers 409 for a duplicate Group name and 404 for a missing Group without writing', async () => {
		const ctx = createTestContext();
		ctx.store.seed('groups', [{ id: groupId, organization_id: ctx.auth.orgId, name: 'Alpha', sort_order: 0 }]);

		await expect(handleUseCaseRequest(_postConfig, ctx, { name: 'Alpha' }, () => ctx)).rejects.toMatchObject({
			status: 409,
			message: 'A Group with that name already exists.'
		});
		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: '22222222-2222-4222-8222-222222222222', name: 'Bravo' }, () => ctx)
		).rejects.toMatchObject({ status: 404, message: 'That Group is no longer available.' });
		expect(await ctx.store.findMany('groups', ctx.auth.orgId)).toMatchObject([{ id: groupId, name: 'Alpha' }]);
		expect(ctx.auditPort.events.filter((event) => event.action.startsWith('group.'))).toEqual([]);
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
			() => handleUseCaseRequest(_postConfig, ctx, { id: groupId, name: 'Denied' }, () => ctx),
			() => handleUseCaseRequest(_putConfig, ctx, { id: groupId, name: 'Denied' }, () => ctx),
			() => handleUseCaseRequest(_deleteConfig, ctx, { id: groupId, name: 'Denied' }, () => ctx)
		]) {
			await expect(run()).rejects.toMatchObject({
				status: 403
			});
		}
		expect(await ctx.store.findMany('groups', ctx.auth.orgId)).toEqual([]);
	});

	it('denies Group writes to a Group-scoped Personnel configurer, including its own Group', async () => {
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
				scopeSet: { kind: 'groups', groupIds: [groupId] }
			}
		});
		ctx.store.seed('groups', [{ id: groupId, organization_id: ctx.auth.orgId, name: 'Alpha', sort_order: 0 }]);
		for (const run of [
			() => handleUseCaseRequest(_getConfig, ctx, undefined, () => ctx),
			() => handleUseCaseRequest(_postConfig, ctx, { name: 'Scoped Created' }, () => ctx),
			() => handleUseCaseRequest(_putConfig, ctx, { id: groupId, name: 'Scoped Renamed' }, () => ctx),
			() => handleUseCaseRequest(_deleteConfig, ctx, { id: groupId }, () => ctx)
		]) {
			await expect(run()).rejects.toMatchObject({ status: 403 });
		}
		expect(await ctx.store.findMany('groups', ctx.auth.orgId)).toMatchObject([{ id: groupId, name: 'Alpha' }]);
	});
});

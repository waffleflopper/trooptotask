import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig as typePost, _putConfig as typePut, _deleteConfig as typeDelete } from './+server';
import { _postConfig as viewPost, _putConfig as viewPut, _deleteConfig as viewDelete } from '../training-views/+server';

describe('Training catalog JSON routes', () => {
	it('returns saved type and view rows and the existing delete response', async () => {
		const ctx = createTestContext();
		const selected = { ...ctx, notifyTrainingTypeDeleted: vi.fn(async () => {}) };
		const type = await handleUseCaseRequest(typePost, ctx, { name: 'CPR', description: 'Annual' }, () => ctx);
		const cleared = await handleUseCaseRequest(typePut, ctx, { id: type.id, description: null }, () => ctx);
		expect(cleared).toMatchObject({ id: type.id, name: 'CPR', description: null, appliesToRoles: [] });

		const view = await handleUseCaseRequest(viewPost, ctx, { name: 'Focus', columnIds: [type.id] }, () => ctx);
		const renamed = await handleUseCaseRequest(viewPut, ctx, { id: view.id, name: 'Focus Two' }, () => ctx);
		expect(renamed).toMatchObject({ id: view.id, name: 'Focus Two', columnIds: [type.id] });
		expect(await handleUseCaseRequest(viewDelete, ctx, { id: view.id }, () => ctx)).toEqual({ success: true });
		expect(await handleUseCaseRequest(typeDelete, ctx, { id: type.id }, () => selected)).toEqual({ success: true });
		expect(selected.notifyTrainingTypeDeleted).toHaveBeenCalledOnce();
	});

	it('retains completed deletion and audit when unexpected notification delivery fails', async () => {
		const ctx = createTestContext();
		const selected = { ...ctx, notifyTrainingTypeDeleted: vi.fn(async () => {}) };
		const type = await handleUseCaseRequest(typePost, ctx, { name: 'CPR' }, () => ctx);
		selected.notifyTrainingTypeDeleted.mockRejectedValueOnce(new Error('delivery unavailable'));
		await expect(handleUseCaseRequest(typeDelete, ctx, { id: type.id }, () => selected)).rejects.toThrow(
			'delivery unavailable'
		);
		expect(await ctx.store.findOne('training_types', ctx.auth.orgId, { id: type.id })).toBeNull();
		expect(ctx.auditPort.events.some(({ action }) => action === 'training_type.deleted')).toBe(true);
	});

	it('rejects malformed IDs and denies a Training operator configuration writes', async () => {
		await expect(
			handleUseCaseRequest(typeDelete, createTestContext(), { id: 'bad' }, () => ({
				...createTestContext(),
				notifyTrainingTypeDeleted: vi.fn(async () => {})
			}))
		).rejects.toMatchObject({
			status: 400
		});
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		const selected = { ...ctx, notifyTrainingTypeDeleted: vi.fn(async () => {}) };
		const saved = {
			id: '11111111-1111-4111-8111-111111111111',
			organization_id: ctx.auth.orgId,
			name: 'Retained type'
		};
		ctx.store.seed('training_types', [saved]);
		await expect(handleUseCaseRequest(typeDelete, ctx, { id: saved.id }, () => selected)).rejects.toMatchObject({
			status: 403
		});
		expect(await ctx.store.findOne('training_types', ctx.auth.orgId, { id: saved.id })).toEqual(saved);
		expect(ctx.notificationPort.notifications).toEqual([]);
		await expect(handleUseCaseRequest(typePost, ctx, { name: 'Denied' }, () => ctx)).rejects.toMatchObject({
			status: 403
		});
		await expect(handleUseCaseRequest(viewPost, ctx, { name: 'Denied' }, () => ctx)).rejects.toMatchObject({
			status: 403
		});
		expect(await ctx.store.findMany('training_types', ctx.auth.orgId)).toEqual([saved]);
		expect(await ctx.store.findMany('training_views', ctx.auth.orgId)).toEqual([]);
	});

	it('denies Group-scoped Training configuration of the Organization catalog', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'configure',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-1'] }
			}
		});

		await expect(handleUseCaseRequest(typePost, ctx, { name: 'Denied type' }, () => ctx)).rejects.toMatchObject({
			status: 403
		});
		await expect(handleUseCaseRequest(viewPost, ctx, { name: 'Denied view' }, () => ctx)).rejects.toMatchObject({
			status: 403
		});
		expect(await ctx.store.findMany('training_types', ctx.auth.orgId)).toEqual([]);
		expect(await ctx.store.findMany('training_views', ctx.auth.orgId)).toEqual([]);
	});
});

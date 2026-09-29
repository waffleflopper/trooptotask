import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig as typePost, _putConfig as typePut, _deleteConfig as typeDelete } from './+server';
import { _postConfig as viewPost, _putConfig as viewPut, _deleteConfig as viewDelete } from '../training-views/+server';

describe('Training catalog JSON routes', () => {
	it('returns saved type and view rows and the existing delete response', async () => {
		const ctx = createTestContext();
		const type = await handleUseCaseRequest(typePost, ctx, { name: 'CPR', description: 'Annual' });
		const cleared = await handleUseCaseRequest(typePut, ctx, { id: type.id, description: null });
		expect(cleared).toMatchObject({ id: type.id, name: 'CPR', description: null, appliesToRoles: [] });

		const view = await handleUseCaseRequest(viewPost, ctx, { name: 'Focus', columnIds: [type.id] });
		const renamed = await handleUseCaseRequest(viewPut, ctx, { id: view.id, name: 'Focus Two' });
		expect(renamed).toMatchObject({ id: view.id, name: 'Focus Two', columnIds: [type.id] });
		expect(await handleUseCaseRequest(viewDelete, ctx, { id: view.id })).toEqual({ success: true });
		expect(await handleUseCaseRequest(typeDelete, ctx, { id: type.id })).toEqual({ success: true });
	});

	it('rejects malformed IDs and denies a Training operator configuration writes', async () => {
		await expect(handleUseCaseRequest(typeDelete, createTestContext(), { id: 'bad' })).rejects.toMatchObject({
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
		await expect(handleUseCaseRequest(typePost, ctx, { name: 'Denied' })).rejects.toMatchObject({ status: 403 });
		await expect(handleUseCaseRequest(viewPost, ctx, { name: 'Denied' })).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('training_types', ctx.auth.orgId)).toEqual([]);
		expect(await ctx.store.findMany('training_views', ctx.auth.orgId)).toEqual([]);
	});
});

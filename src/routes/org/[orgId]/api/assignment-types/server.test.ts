import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig, _putConfig } from './+server';

const ID = '00000000-0000-4000-8000-000000000001';

describe('assignment-type route', () => {
	it('returns saved rows and deletion result through Calendar operations', async () => {
		const ctx = createTestContext();
		const notifyAdmins = vi.spyOn(ctx.notifications, 'notifyAdmins');
		const created = await handleUseCaseRequest(_postConfig, ctx, {
			name: 'Group Duty',
			shortName: 'GD',
			assignTo: 'group',
			color: '#123456'
		});
		expect(created).toMatchObject({ name: 'Group Duty', shortName: 'GD', assignTo: 'group' });
		ctx.store.seed('assignment_types', [
			{
				id: ID,
				organization_id: ctx.auth.orgId,
				name: 'Old',
				short_name: 'O',
				assign_to: 'personnel',
				color: '#111111',
				sort_order: 4,
				exempt_personnel_ids: ['person-1']
			}
		]);
		const updated = await handleUseCaseRequest(_putConfig, ctx, { id: ID, name: 'New' });
		expect(updated).toMatchObject({ id: ID, name: 'New', sortOrder: 4, exemptPersonnelIds: ['person-1'] });
		expect(await handleUseCaseRequest(_deleteConfig, ctx, { id: ID })).toEqual({ success: true });
		expect(await ctx.store.findOne('assignment_types', ctx.auth.orgId, { id: ID })).toBeNull();
		expect(notifyAdmins).toHaveBeenCalledOnce();
	});

	it('rejects malformed deletion and a Calendar operator configuration write', async () => {
		await expect(handleUseCaseRequest(_deleteConfig, createTestContext(), { id: 'bad' })).rejects.toMatchObject({
			status: 400
		});
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'operate',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				}
			}
		});
		await expect(
			handleUseCaseRequest(_postConfig, ctx, { name: 'Duty', shortName: 'D', assignTo: 'group' })
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('assignment_types', ctx.auth.orgId)).toEqual([]);
	});
});

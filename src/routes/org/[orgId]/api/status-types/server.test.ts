import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig, _putConfig } from './+server';

const ID = '00000000-0000-4000-8000-000000000001';

describe('status-type route', () => {
	it('returns saved catalog rows and deletion feedback through Calendar operations', async () => {
		const ctx = createTestContext();
		const notifyAdmins = vi.spyOn(ctx.notifications, 'notifyAdmins');
		ctx.store.seed('status_types', [
			{
				id: ID,
				organization_id: ctx.auth.orgId,
				name: 'Leave',
				color: '#22c55e',
				text_color: '#ffffff',
				sort_order: 0
			}
		]);

		const updated = await handleUseCaseRequest(_putConfig, ctx, { id: ID, name: 'Annual Leave' });
		expect(updated).toMatchObject({ id: ID, name: 'Annual Leave', color: '#22c55e' });
		expect(await handleUseCaseRequest(_deleteConfig, ctx, { id: ID })).toEqual({ success: true });
		expect(notifyAdmins).toHaveBeenCalledOnce();
		expect(await ctx.store.findOne('status_types', ctx.auth.orgId, { id: ID })).toBeNull();
	});

	it('rejects an invalid delete ID and an actor without Calendar configuration access', async () => {
		await expect(handleUseCaseRequest(_deleteConfig, createTestContext(), { id: 'bad' })).rejects.toMatchObject({
			status: 400
		});
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'organization' },
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
		const notifyAdmins = vi.spyOn(ctx.notifications, 'notifyAdmins');

		await expect(handleUseCaseRequest(_postConfig, ctx, { name: 'TDY' })).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('status_types', ctx.auth.orgId)).toEqual([]);
		expect(notifyAdmins).not.toHaveBeenCalled();
	});
});

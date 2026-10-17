import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$features/calendar/calendarPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _getConfig, _postConfig, _putConfig } from './+server';

const ID = '00000000-0000-4000-8000-000000000001';
const SICK = '00000000-0000-4000-8000-000000000002';

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

		const updated = await handleUseCaseRequest(_putConfig, ctx, { id: ID, name: 'Annual Leave' }, () => ctx);
		expect(updated).toMatchObject({ id: ID, name: 'Annual Leave', color: '#22c55e' });
		expect(await handleUseCaseRequest(_deleteConfig, ctx, { id: ID }, () => ctx)).toEqual({ success: true });
		expect(notifyAdmins).toHaveBeenCalledOnce();
		expect(await ctx.store.findOne('status_types', ctx.auth.orgId, { id: ID })).toBeNull();
	});

	it('rejects an invalid delete ID and an actor without Calendar configuration access', async () => {
		await expect(
			handleUseCaseRequest(_deleteConfig, createTestContext(), { id: 'bad' }, () => createTestContext())
		).rejects.toMatchObject({
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

		await expect(handleUseCaseRequest(_postConfig, ctx, { name: 'TDY' }, () => ctx)).rejects.toMatchObject({
			status: 403
		});
		expect(await ctx.store.findMany('status_types', ctx.auth.orgId)).toEqual([]);
		expect(notifyAdmins).not.toHaveBeenCalled();
	});

	it('reads the saved status types in their saved order for a configurator only', async () => {
		const ctx = createTestContext();
		ctx.store.seed('status_types', [
			{
				id: ID,
				organization_id: ctx.auth.orgId,
				name: 'Leave',
				color: '#22c55e',
				text_color: '#ffffff',
				short_label: null,
				sort_order: 1
			},
			{
				id: SICK,
				organization_id: ctx.auth.orgId,
				name: 'Sick',
				color: '#ef4444',
				text_color: '#ffffff',
				short_label: 'SK',
				sort_order: 0
			}
		]);
		expect(await handleUseCaseRequest(_getConfig, ctx, undefined, () => ctx)).toMatchObject([
			{ id: SICK, shortLabel: 'SK', sortOrder: 0 },
			{ id: ID, shortLabel: null, sortOrder: 1 }
		]);
		const operator = createTestContext({
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
		await expect(handleUseCaseRequest(_getConfig, operator, undefined, () => operator)).rejects.toMatchObject({
			status: 403
		});
	});
});

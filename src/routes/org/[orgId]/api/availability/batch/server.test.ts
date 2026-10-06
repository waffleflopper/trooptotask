import { describe, expect, it } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig } from './+server';

function context(calendar: 'operate' | 'view' | 'none' = 'operate') {
	return createWritePortsContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			scopeSet: { kind: 'organization' },
			capabilityMap: {
				calendar,
				personnel: 'none',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			}
		}
	});
}

describe('Calendar availability batch admission and effects', () => {
	it('lets a Calendar-only operator remove 500 saved entries and reports zero on replay', async () => {
		const ctx = context();
		ctx.store.seed('personnel', [{ id: 'person-a', organization_id: ctx.auth.orgId, group_id: null }]);
		const ids = Array.from({ length: 500 }, (_, i) => `entry-${i}`);
		ctx.store.seed(
			'availability_entries',
			ids.map((id) => ({ id, organization_id: ctx.auth.orgId, personnel_id: 'person-a' }))
		);
		ctx.store.seed('availability_entries', [
			{ id: 'unrelated', organization_id: ctx.auth.orgId, personnel_id: 'person-a' },
			{ id: 'foreign', organization_id: 'org-b', personnel_id: 'person-b' }
		]);
		const narrow = {
			auth: ctx.auth,
			audit: ctx.audit,
			personnelCalendarRoster: ctx.personnelCalendarRoster,
			availabilityRemoval: ctx.availabilityRemoval
		};
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { ids }, () => narrow)).resolves.toEqual({ deleted: 500 });
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { ids }, () => narrow)).resolves.toEqual({ deleted: 0 });
		expect(await ctx.store.findMany('availability_entries', ctx.auth.orgId)).toEqual([
			{ id: 'unrelated', organization_id: ctx.auth.orgId, personnel_id: 'person-a' }
		]);
		expect(await ctx.rawStore.findMany('availability_entries', 'org-b')).toEqual([
			{ id: 'foreign', organization_id: 'org-b', personnel_id: 'person-b' }
		]);
		expect(ctx.audit.events.map((event) => [event.action, event.details])).toEqual([
			['availability.bulk_deleted', { count: 500 }],
			['availability.bulk_deleted', { count: 0 }]
		]);
	});

	it.each(['view', 'none'] as const)('rejects %s before constructing or invoking a mutation', async (calendar) => {
		const ctx = context(calendar);
		ctx.store.seed('availability_entries', [
			{ id: 'entry-a', organization_id: ctx.auth.orgId, personnel_id: 'person-a' }
		]);
		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { ids: ['entry-a'] }, () => {
				throw new Error('Denied request reached persistence');
			})
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('availability_entries', ctx.auth.orgId)).toEqual([
			{ id: 'entry-a', organization_id: ctx.auth.orgId, personnel_id: 'person-a' }
		]);
		expect(ctx.audit.events.some((event) => event.action === 'availability.bulk_deleted')).toBe(false);
	});

	it.each([Array.from({ length: 501 }, (_, i) => `entry-${i}`), Array(501).fill('same-id')])(
		'rejects a raw 501-ID batch before reading references or mutating',
		async (ids: string[]) => {
			const ctx = context();
			const narrow = {
				auth: ctx.auth,
				audit: ctx.audit,
				personnelCalendarRoster: ctx.personnelCalendarRoster,
				availabilityRemoval: {
					findPersonnelIds: async () => {
						throw new Error('Oversized request reached reference lookup');
					},
					deleteIds: async () => {
						throw new Error('Oversized request reached mutation');
					}
				}
			};
			await expect(handleUseCaseRequest(_deleteConfig, ctx, { ids }, () => narrow)).rejects.toMatchObject({
				status: 400
			});
			expect(ctx.audit.events).toEqual([]);
		}
	);

	it('retains the ordinary Add behavior and saved note', async () => {
		const ctx = context();
		ctx.store.seed('personnel', [{ id: 'person-a', organization_id: ctx.auth.orgId, group_id: null }]);
		await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				records: [
					{
						personnelId: 'person-a',
						statusTypeId: 'leave',
						startDate: '2026-10-06',
						endDate: '2026-10-06',
						note: 'Saved before removal'
					}
				]
			},
			() => ctx
		);
		expect(await ctx.store.findMany('availability_entries', ctx.auth.orgId)).toEqual([
			expect.objectContaining({
				personnel_id: 'person-a',
				status_type_id: 'leave',
				start_date: '2026-10-06',
				end_date: '2026-10-06',
				note: 'Saved before removal'
			})
		]);
	});
});

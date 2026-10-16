import { describe, expect, it } from 'vitest';
import { createWritePortsContext } from '$features/calendar/calendarPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig } from './+server';

const PERSON_A = '00000000-0000-4000-8000-000000000010';
const PERSON_B = '00000000-0000-4000-8000-000000000011';
const LEAVE_STATUS = '00000000-0000-4000-8000-000000000012';
const ENTRY_A = '00000000-0000-4000-8000-000000000013';
const entryId = (index: number) => `00000000-0000-4000-9000-${String(index).padStart(12, '0')}`;
const SAME_ENTRY = '00000000-0000-4000-8000-000000000014';

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
		ctx.store.seed('personnel', [{ id: PERSON_A, organization_id: ctx.auth.orgId, group_id: null }]);
		const ids = Array.from({ length: 500 }, (_, i) => entryId(i));
		ctx.store.seed(
			'availability_entries',
			ids.map((id) => ({ id, organization_id: ctx.auth.orgId, personnel_id: PERSON_A }))
		);
		ctx.store.seed('availability_entries', [
			{ id: 'unrelated', organization_id: ctx.auth.orgId, personnel_id: PERSON_A },
			{ id: 'foreign', organization_id: 'org-b', personnel_id: PERSON_B }
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
			{ id: 'unrelated', organization_id: ctx.auth.orgId, personnel_id: PERSON_A }
		]);
		expect(await ctx.rawStore.findMany('availability_entries', 'org-b')).toEqual([
			{ id: 'foreign', organization_id: 'org-b', personnel_id: PERSON_B }
		]);
		expect(ctx.audit.events.map((event) => [event.action, event.details])).toEqual([
			['availability.bulk_deleted', { count: 500 }],
			['availability.bulk_deleted', { count: 0 }]
		]);
	});

	it.each(['view', 'none'] as const)('rejects %s before constructing or invoking a mutation', async (calendar) => {
		const ctx = context(calendar);
		ctx.store.seed('availability_entries', [{ id: ENTRY_A, organization_id: ctx.auth.orgId, personnel_id: PERSON_A }]);
		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { ids: [ENTRY_A] }, () => {
				throw new Error('Denied request reached persistence');
			})
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('availability_entries', ctx.auth.orgId)).toEqual([
			{ id: ENTRY_A, organization_id: ctx.auth.orgId, personnel_id: PERSON_A }
		]);
		expect(ctx.audit.events.some((event) => event.action === 'availability.bulk_deleted')).toBe(false);
	});

	it.each([Array.from({ length: 501 }, (_, i) => entryId(i)), Array(501).fill(SAME_ENTRY)])(
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
		ctx.store.seed('personnel', [{ id: PERSON_A, organization_id: ctx.auth.orgId, group_id: null }]);
		await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				records: [
					{
						personnelId: PERSON_A,
						statusTypeId: LEAVE_STATUS,
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
				personnel_id: PERSON_A,
				status_type_id: LEAVE_STATUS,
				start_date: '2026-10-06',
				end_date: '2026-10-06',
				note: 'Saved before removal'
			})
		]);
	});
});

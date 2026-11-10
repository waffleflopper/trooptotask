import { describe, expect, it } from 'vitest';
import { createWritePortsContext } from '$features/calendar/calendarPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const PERSON = '00000000-0000-4000-8000-000000000010';
const LEAVE = '00000000-0000-4000-8000-000000000012';
const ENTRY = '00000000-0000-4000-8000-000000000013';
const saved = {
	id: ENTRY,
	personnelId: PERSON,
	statusTypeId: LEAVE,
	startDate: '2026-11-10',
	endDate: '2026-11-12',
	note: null
};

function context(calendar: 'operate' | 'view' | 'none') {
	const ctx = createWritePortsContext({
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
	ctx.store.seed('personnel', [{ id: PERSON, organization_id: ctx.auth.orgId, group_id: null }]);
	return ctx;
}

describe('POST /api/availability/undo', () => {
	const seededRow = (ctx: ReturnType<typeof context>) => ({
		id: ENTRY,
		organization_id: ctx.auth.orgId,
		personnel_id: PERSON,
		status_type_id: LEAVE,
		start_date: saved.startDate,
		end_date: saved.endDate,
		note: null
	});

	it('lets a Calendar operator take back an add, and leaves nothing to restore for it', async () => {
		const ctx = context('operate');
		ctx.store.seed('availability_entries', [seededRow(ctx)]);

		await expect(handleUseCaseRequest(_postConfig, ctx, { remove: [saved] }, () => ctx)).resolves.toEqual({
			removedIds: [ENTRY],
			restored: [],
			changedIds: []
		});
		expect(await ctx.store.findMany('availability_entries', ctx.auth.orgId)).toEqual([]);

		await expect(
			handleUseCaseRequest(_postConfig, ctx, { restore: [{ id: ENTRY, personnelId: PERSON }] }, () => ctx)
		).resolves.toEqual({ removedIds: [], restored: [], changedIds: [ENTRY] });
		expect(await ctx.store.findMany('availability_entries', ctx.auth.orgId)).toEqual([]);
	});

	it('lets a Calendar operator put a removal back with the values the removal deleted', async () => {
		const ctx = context('operate');
		ctx.store.seed('availability_entries', [{ ...seededRow(ctx), note: 'Edited since the page loaded' }]);
		await ctx.calendarAvailability.deleteIds([ENTRY]);

		await expect(
			handleUseCaseRequest(_postConfig, ctx, { restore: [{ id: ENTRY, personnelId: PERSON }] }, () => ctx)
		).resolves.toEqual({
			removedIds: [],
			restored: [{ ...saved, organization_id: ctx.auth.orgId, note: 'Edited since the page loaded' }],
			changedIds: []
		});
		expect(await ctx.store.findMany('availability_entries', ctx.auth.orgId)).toEqual([
			{ ...seededRow(ctx), note: 'Edited since the page loaded' }
		]);
	});

	it.each(['view', 'none'] as const)('refuses %s access before any status is read or written', async (calendar) => {
		const ctx = context(calendar);
		await expect(
			handleUseCaseRequest(_postConfig, ctx, { restore: [{ id: ENTRY, personnelId: PERSON }] }, () => {
				throw new Error('Denied request reached persistence');
			})
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('availability_entries', ctx.auth.orgId)).toEqual([]);
	});
});

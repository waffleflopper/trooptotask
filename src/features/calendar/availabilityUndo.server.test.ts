import { describe, expect, it } from 'vitest';
import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { createWritePortsContext } from './calendarPersistence.test-support.server';
import { undoAvailabilityChange } from './availabilityUndo.server';

const PERSON_A = '00000000-0000-4000-8000-000000000010';
const PERSON_B = '00000000-0000-4000-8000-000000000011';
const LEAVE = '00000000-0000-4000-8000-000000000012';
const TDY = '00000000-0000-4000-8000-000000000013';
const ENTRY_1 = '00000000-0000-4000-8000-000000000021';
const ENTRY_2 = '00000000-0000-4000-8000-000000000022';
const ENTRY_3 = '00000000-0000-4000-8000-000000000023';

const entry = (id: string, overrides: Partial<Record<string, unknown>> = {}) => ({
	id,
	personnelId: PERSON_A,
	statusTypeId: LEAVE,
	startDate: '2026-11-10',
	endDate: '2026-11-12',
	note: null,
	...overrides
});
const row = (id: string, overrides: Partial<Record<string, unknown>> = {}) => ({
	id,
	organization_id: 'test-org',
	personnel_id: PERSON_A,
	status_type_id: LEAVE,
	start_date: '2026-11-10',
	end_date: '2026-11-12',
	note: null,
	...overrides
});

function context(options?: Parameters<typeof createWritePortsContext>[0]) {
	const ctx = createWritePortsContext(options);
	ctx.store.seed('personnel', [
		{ id: PERSON_A, organization_id: 'test-org', group_id: 'group-a' },
		{ id: PERSON_B, organization_id: 'test-org', group_id: 'group-b' }
	]);
	return ctx;
}
const stored = (ctx: ReturnType<typeof context>) => ctx.store.findMany('availability_entries', 'test-org');

describe('undoAvailabilityChange: remove (undo of an add)', () => {
	it('deletes the rows the add wrote and leaves other rows alone', async () => {
		const ctx = context();
		ctx.store.seed('availability_entries', [row(ENTRY_1), row(ENTRY_2, { personnel_id: PERSON_B }), row(ENTRY_3)]);

		const result = await undoAvailabilityChange(ctx, {
			remove: [entry(ENTRY_1), entry(ENTRY_2, { personnelId: PERSON_B })]
		});

		expect(result).toEqual({ removedIds: [ENTRY_1, ENTRY_2], restoredIds: [], changedIds: [] });
		expect(await stored(ctx)).toEqual([row(ENTRY_3)]);
	});

	it('reports a row edited or removed since the add and leaves it as it is', async () => {
		const ctx = context();
		ctx.store.seed('availability_entries', [
			row(ENTRY_1, { note: 'Edited by a colleague' }),
			row(ENTRY_2, { end_date: '2026-11-20' })
		]);

		const result = await undoAvailabilityChange(ctx, {
			remove: [entry(ENTRY_1), entry(ENTRY_2), entry(ENTRY_3)]
		});

		expect(result).toEqual({ removedIds: [], restoredIds: [], changedIds: [ENTRY_1, ENTRY_2, ENTRY_3] });
		expect(await stored(ctx)).toEqual([
			row(ENTRY_1, { note: 'Edited by a colleague' }),
			row(ENTRY_2, { end_date: '2026-11-20' })
		]);
	});

	it('removes the unchanged rows of a batch and reports only the changed one', async () => {
		const ctx = context();
		ctx.store.seed('availability_entries', [row(ENTRY_1), row(ENTRY_2, { status_type_id: TDY })]);

		const result = await undoAvailabilityChange(ctx, { remove: [entry(ENTRY_1), entry(ENTRY_2)] });

		expect(result).toEqual({ removedIds: [ENTRY_1], restoredIds: [], changedIds: [ENTRY_2] });
		expect(await stored(ctx)).toEqual([row(ENTRY_2, { status_type_id: TDY })]);
	});
});

describe('undoAvailabilityChange: restore (undo of a removal)', () => {
	it('saves each removed entry again under its own id with its note', async () => {
		const ctx = context();

		const result = await undoAvailabilityChange(ctx, {
			restore: [entry(ENTRY_1, { note: 'Block leave' }), entry(ENTRY_2, { personnelId: PERSON_B, statusTypeId: TDY })]
		});

		expect(result).toEqual({ removedIds: [], restoredIds: [ENTRY_1, ENTRY_2], changedIds: [] });
		expect(await stored(ctx)).toEqual([
			row(ENTRY_1, { note: 'Block leave' }),
			row(ENTRY_2, { personnel_id: PERSON_B, status_type_id: TDY })
		]);
	});

	it('skips an entry whose id exists again and leaves that row untouched', async () => {
		const ctx = context();
		ctx.store.seed('availability_entries', [row(ENTRY_1, { start_date: '2026-12-01', end_date: '2026-12-02' })]);

		const result = await undoAvailabilityChange(ctx, {
			restore: [entry(ENTRY_1), entry(ENTRY_2, { statusTypeId: TDY })]
		});

		expect(result).toEqual({ removedIds: [], restoredIds: [ENTRY_2], changedIds: [ENTRY_1] });
		expect(await stored(ctx)).toEqual([
			row(ENTRY_1, { start_date: '2026-12-01', end_date: '2026-12-02' }),
			row(ENTRY_2, { status_type_id: TDY })
		]);
	});

	it('skips an entry when the Person now has the same status over overlapping dates', async () => {
		const ctx = context();
		ctx.store.seed('availability_entries', [row(ENTRY_3, { start_date: '2026-11-12', end_date: '2026-11-15' })]);

		const result = await undoAvailabilityChange(ctx, { restore: [entry(ENTRY_1)] });

		expect(result).toEqual({ removedIds: [], restoredIds: [], changedIds: [ENTRY_1] });
		expect(await stored(ctx)).toEqual([row(ENTRY_3, { start_date: '2026-11-12', end_date: '2026-11-15' })]);
	});

	it('restores beside a different status, another Person, or dates that only touch a neighbour', async () => {
		const ctx = context();
		ctx.store.seed('availability_entries', [
			row(ENTRY_3, { status_type_id: TDY }),
			row('00000000-0000-4000-8000-000000000024', { personnel_id: PERSON_B }),
			row('00000000-0000-4000-8000-000000000025', { start_date: '2026-11-13', end_date: '2026-11-14' })
		]);

		const result = await undoAvailabilityChange(ctx, { restore: [entry(ENTRY_1)] });

		expect(result).toEqual({ removedIds: [], restoredIds: [ENTRY_1], changedIds: [] });
	});
});

describe('undoAvailabilityChange: access and input', () => {
	it('refuses a Person outside the actor’s Group scope before changing anything', async () => {
		const ctx = context({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'operate',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-a'] })
			}
		});
		ctx.store.seed('availability_entries', [row(ENTRY_1, { personnel_id: PERSON_B })]);

		await expect(
			undoAvailabilityChange(ctx, {
				remove: [entry(ENTRY_1, { personnelId: PERSON_B })],
				restore: [entry(ENTRY_2)]
			})
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.rawStore.findMany('availability_entries', 'test-org')).toEqual([
			row(ENTRY_1, { personnel_id: PERSON_B })
		]);
	});

	it('reports an entry of a Person who is gone instead of failing the rest', async () => {
		const ctx = context();
		const GONE = '00000000-0000-4000-8000-000000000099';

		const result = await undoAvailabilityChange(ctx, {
			restore: [entry(ENTRY_1), entry(ENTRY_2, { personnelId: GONE })]
		});

		expect(result).toEqual({ removedIds: [], restoredIds: [ENTRY_1], changedIds: [ENTRY_2] });
	});

	it.each([
		['nothing to undo', {}],
		['a repeated id', { remove: [entry(ENTRY_1)], restore: [entry(ENTRY_1)] }],
		['an end before the start', { restore: [entry(ENTRY_1, { startDate: '2026-11-12', endDate: '2026-11-10' })] }],
		[
			'more than 500 entries',
			{ remove: Array.from({ length: 501 }, (_, i) => entry(`00000000-0000-4000-9000-${String(i).padStart(12, '0')}`)) }
		]
	])('rejects %s with 400', async (_name, input) => {
		await expect(undoAvailabilityChange(context(), input)).rejects.toMatchObject({ status: 400 });
	});
});

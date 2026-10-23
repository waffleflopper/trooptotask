import { describe, expect, it } from 'vitest';
import type { AvailabilityImportEntry } from './contracts';
import { createWritePortsContext } from './calendarPersistence.test-support.server';
import { importAvailabilityEntries } from './availabilityImport.server';

const ALPHA = '00000000-0000-4000-8000-000000000010';
const BRAVO = '00000000-0000-4000-8000-000000000011';
const FOREIGN = '00000000-0000-4000-8000-000000000012';
const LEAVE = '00000000-0000-4000-8000-000000000020';
const TDY = '00000000-0000-4000-8000-000000000021';
const SAVED_LEAVE = '00000000-0000-4000-8000-000000000030';
const SAVED_TDY = '00000000-0000-4000-8000-000000000031';
const BRAVO_LEAVE = '00000000-0000-4000-8000-000000000032';

const OPERATOR = {
	calendar: 'operate',
	personnel: 'view',
	training: 'view',
	criticalTasks: 'view',
	onboarding: 'view',
	ratingScheme: 'view'
} as const;

function row(overrides: Partial<AvailabilityImportEntry> = {}): AvailabilityImportEntry {
	return {
		personnelId: ALPHA,
		statusTypeId: LEAVE,
		startDate: '2026-12-01',
		endDate: '2026-12-03',
		note: null,
		overlap: 'none',
		...overrides
	} as AvailabilityImportEntry;
}

function context(options?: Parameters<typeof createWritePortsContext>[0]) {
	const ctx = createWritePortsContext(options);
	ctx.store.seed('personnel', [
		{ id: ALPHA, organization_id: 'test-org', group_id: 'group-a' },
		{ id: BRAVO, organization_id: 'test-org', group_id: 'group-b' },
		{ id: FOREIGN, organization_id: 'another-org', group_id: 'group-a' }
	]);
	ctx.store.seed('availability_entries', [
		saved(SAVED_LEAVE, ALPHA, LEAVE, '2026-11-05', '2026-11-12'),
		saved(SAVED_TDY, ALPHA, TDY, '2026-11-10', '2026-11-20'),
		saved(BRAVO_LEAVE, BRAVO, LEAVE, '2026-11-05', '2026-11-12')
	]);
	return ctx;
}

function saved(id: string, personnel_id: string, status_type_id: string, start_date: string, end_date: string) {
	return { id, organization_id: 'test-org', personnel_id, status_type_id, start_date, end_date, note: 'Saved' };
}

const REVIEWED = {
	[SAVED_LEAVE]: { id: SAVED_LEAVE, statusTypeId: LEAVE, startDate: '2026-11-05', endDate: '2026-11-12' },
	[SAVED_TDY]: { id: SAVED_TDY, statusTypeId: TDY, startDate: '2026-11-10', endDate: '2026-11-20' },
	[BRAVO_LEAVE]: { id: BRAVO_LEAVE, statusTypeId: LEAVE, startDate: '2026-11-05', endDate: '2026-11-12' }
};

async function calendar(ctx: ReturnType<typeof context>) {
	const rows = await ctx.store.findMany<{
		id: string;
		personnel_id: string;
		status_type_id: string;
		start_date: string;
		end_date: string;
	}>('availability_entries', 'test-org');
	return rows
		.map(
			(entry) =>
				`${entry.personnel_id.slice(-2)} ${entry.status_type_id.slice(-2)} ${entry.start_date}..${entry.end_date}`
		)
		.sort();
}

describe('importAvailabilityEntries', () => {
	it.each([
		{ reviewed: 'Saved', current: 'Edited' },
		{ reviewed: null, current: 'Added' },
		{ reviewed: 'Saved', current: null }
	])('keeps a note changed from $reviewed to $current after Review', async ({ reviewed, current }) => {
		const ctx = context();
		await ctx.store.update('availability_entries', 'test-org', SAVED_LEAVE, { note: current });
		const result = await importAvailabilityEntries(ctx, {
			entries: [
				row({
					startDate: '2026-11-03',
					endDate: '2026-11-06',
					overlap: 'replace',
					replaces: [{ ...REVIEWED[SAVED_LEAVE], note: reviewed }]
				})
			]
		});
		expect(result).toMatchObject({ added: 0, removed: 0, errors: [{ index: 0 }] });
		expect(await ctx.store.findMany('availability_entries', 'test-org', { id: SAVED_LEAVE })).toEqual([
			expect.objectContaining({ id: SAVED_LEAVE, note: current })
		]);
	});

	it('adds free rows, keeps both on keep, and swaps only the overlapped entries on replace', async () => {
		const ctx = context();

		const result = await importAvailabilityEntries(ctx, {
			entries: [
				row(),
				row({ personnelId: BRAVO, startDate: '2026-11-10', endDate: '2026-11-14', overlap: 'keep' }),
				row({
					statusTypeId: TDY,
					startDate: '2026-11-03',
					endDate: '2026-11-11',
					overlap: 'replace',
					replaces: [REVIEWED[SAVED_LEAVE], REVIEWED[SAVED_TDY]]
				})
			]
		});

		expect(result).toEqual({ added: 3, removed: 2, errors: [] });
		expect(await calendar(ctx)).toEqual([
			'10 20 2026-12-01..2026-12-03',
			'10 21 2026-11-03..2026-11-11',
			'11 20 2026-11-05..2026-11-12',
			'11 20 2026-11-10..2026-11-14'
		]);
		expect(ctx.audit.events).toEqual([
			expect.objectContaining({
				action: 'availability.bulk_imported',
				resourceType: 'availability',
				details: { added: 3, removed: 2 }
			})
		]);
	});

	it('refuses rows the calendar has changed under, and saves the rest', async () => {
		const ctx = context();

		const result = await importAvailabilityEntries(ctx, {
			entries: [
				row({ startDate: '2026-11-04', endDate: '2026-11-05' }),
				row({ startDate: '2026-11-05', endDate: '2026-11-12', overlap: 'keep' }),
				row({ startDate: '2026-11-12', endDate: '2026-11-13', overlap: 'replace', replaces: [REVIEWED[SAVED_LEAVE]] }),
				row({ startDate: '2026-11-01', endDate: '2026-11-02' })
			]
		});

		expect(result).toEqual({
			added: 1,
			removed: 0,
			errors: [
				{ index: 0, message: 'This row now overlaps the calendar. Import the file again to choose what happens.' },
				{ index: 1, message: 'Already on the calendar.' },
				{ index: 2, message: 'This row now overlaps the calendar. Import the file again to choose what happens.' }
			]
		});
		expect(await calendar(ctx)).toEqual([
			'10 20 2026-11-01..2026-11-02',
			'10 20 2026-11-05..2026-11-12',
			'10 21 2026-11-10..2026-11-20',
			'11 20 2026-11-05..2026-11-12'
		]);
	});

	it('refuses a replace whose reviewed entry changed since Review and keeps that entry', async () => {
		const ctx = context();
		await ctx.store.update('availability_entries', 'test-org', SAVED_LEAVE, { end_date: '2026-11-08' });
		await ctx.store.update('availability_entries', 'test-org', BRAVO_LEAVE, { status_type_id: TDY });

		const result = await importAvailabilityEntries(ctx, {
			entries: [
				row({ startDate: '2026-11-01', endDate: '2026-11-06', overlap: 'replace', replaces: [REVIEWED[SAVED_LEAVE]] }),
				row({
					personnelId: BRAVO,
					startDate: '2026-11-01',
					endDate: '2026-11-06',
					overlap: 'replace',
					replaces: [REVIEWED[BRAVO_LEAVE]]
				}),
				row({ startDate: '2026-12-01', endDate: '2026-12-02' })
			]
		});

		expect(result.added).toBe(1);
		expect(result.removed).toBe(0);
		expect(result.errors.map((error) => error.index)).toEqual([0, 1]);
		expect(await calendar(ctx)).toEqual([
			'10 20 2026-11-05..2026-11-08',
			'10 20 2026-12-01..2026-12-02',
			'10 21 2026-11-10..2026-11-20',
			'11 21 2026-11-05..2026-11-12'
		]);
	});

	it('refuses a replace that names an entry it does not overlap or another person owns', async () => {
		const ctx = context();

		const result = await importAvailabilityEntries(ctx, {
			entries: [
				row({
					startDate: '2026-11-05',
					endDate: '2026-11-06',
					overlap: 'replace',
					replaces: [REVIEWED[SAVED_LEAVE], REVIEWED[BRAVO_LEAVE]]
				}),
				row({ startDate: '2026-11-21', endDate: '2026-11-22', overlap: 'keep' }),
				row({ startDate: '2026-11-25', endDate: '2026-11-26', overlap: 'replace', replaces: [REVIEWED[SAVED_TDY]] })
			]
		});

		expect(result.added).toBe(1);
		expect(result.errors.map((error) => error.index)).toEqual([0, 2]);
		expect(await calendar(ctx)).toEqual([
			'10 20 2026-11-05..2026-11-12',
			'10 20 2026-11-21..2026-11-22',
			'10 21 2026-11-10..2026-11-20',
			'11 20 2026-11-05..2026-11-12'
		]);
	});

	it('accepts a kept in-file overlap that an earlier request already saved', async () => {
		const ctx = context();
		const first = row({ startDate: '2026-12-01', endDate: '2026-12-05' });
		await importAvailabilityEntries(ctx, { entries: [first] });

		const result = await importAvailabilityEntries(ctx, {
			entries: [
				row({
					statusTypeId: TDY,
					startDate: '2026-12-04',
					endDate: '2026-12-08',
					alongside: [{ statusTypeId: LEAVE, startDate: '2026-12-01', endDate: '2026-12-05' }]
				}),
				row({ statusTypeId: TDY, startDate: '2026-12-05', endDate: '2026-12-09' })
			]
		});

		expect(result.added).toBe(1);
		expect(result.errors.map((error) => error.index)).toEqual([1]);
		expect(await calendar(ctx)).toContain('10 21 2026-12-04..2026-12-08');
	});

	it('refuses people outside the roster or the member scope row by row', async () => {
		const ctx = context({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: OPERATOR,
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});

		const result = await importAvailabilityEntries(ctx, {
			entries: [row(), row({ personnelId: BRAVO }), row({ personnelId: FOREIGN })]
		});

		expect(result).toEqual({
			added: 1,
			removed: 0,
			errors: [
				{ index: 1, message: 'This person is not on a roster you can change.' },
				{ index: 2, message: 'This person is not on a roster you can change.' }
			]
		});
		expect(await calendar(ctx)).toContain('10 20 2026-12-01..2026-12-03');
	});

	it('writes nothing when every row is refused', async () => {
		const ctx = context();

		const result = await importAvailabilityEntries(ctx, {
			entries: [row({ startDate: '2026-11-05', endDate: '2026-11-12' })]
		});

		expect(result).toEqual({ added: 0, removed: 0, errors: [{ index: 0, message: 'Already on the calendar.' }] });
		expect(ctx.audit.events).toEqual([]);
	});

	it('requires Calendar operation access before reading anything', async () => {
		const ctx = context({ auth: { capabilityMap: { ...OPERATOR, calendar: 'view' } } });

		await expect(importAvailabilityEntries(ctx, { entries: [row()] })).rejects.toMatchObject({
			status: 403,
			message: 'This action requires Calendar operation access'
		});
		expect(await calendar(ctx)).toHaveLength(3);
	});
});

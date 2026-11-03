import { describe, expect, it } from 'vitest';
import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import {
	computeAvailabilityBoard,
	dayOnOrFirst,
	dominantCauses,
	groupWhoIsOut,
	lowestCell,
	type AvailabilityBoardInput
} from './availabilityBoard';

function person(id: string, lastName: string, groupId: string | null, rank = 'SGT'): Personnel {
	return { id, rank, lastName, firstName: 'Pat', mos: '11B', clinicRole: '', groupId, groupName: '' };
}

function away(
	id: string,
	personnelId: string,
	statusTypeId: string,
	startDate: string,
	endDate: string
): AvailabilityEntry {
	return { id, personnelId, statusTypeId, startDate, endDate, note: null };
}

function status(id: string, name: string, sortOrder: number): StatusType {
	return { id, name, color: `#00000${sortOrder}`, textColor: '#ffffff', shortLabel: null, rosterEffect: 'A', sortOrder };
}

const statusTypes = [status('leave', 'Leave', 0), status('tdy', 'TDY', 1), status('appt', 'Appt', 2)];
const groups: Group[] = [
	{ id: 'alpha', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 },
	{ id: 'bravo', name: 'Bravo', sortOrder: 1, parentId: null, depth: 1 }
];
const people = [
	person('a1', 'Able', 'alpha'),
	person('a2', 'Adams', 'alpha'),
	person('b1', 'Baker', 'bravo'),
	person('b2', 'Brown', 'bravo', 'SSG'),
	person('b3', 'Bell', 'bravo'),
	person('b4', 'Boyd', 'bravo')
];

function board(entries: AvailabilityEntry[], overrides: Partial<AvailabilityBoardInput> = {}) {
	return computeAvailabilityBoard({
		personnel: people,
		entries,
		statusTypes,
		awayStatusTypeIds: new Set(statusTypes.map((type) => type.id)),
		groups,
		selectedRootIds: new Set(['alpha', 'bravo']),
		includeUnassigned: false,
		startDate: '2026-03-02',
		endDate: '2026-03-06',
		...overrides
	});
}

describe('computeAvailabilityBoard', () => {
	const entries = [
		away('1', 'a1', 'leave', '2026-03-03', '2026-03-04'),
		away('2', 'a2', 'tdy', '2026-03-03', '2026-03-05'),
		away('3', 'b1', 'leave', '2026-03-04', '2026-03-04'),
		away('4', 'b2', 'appt', '2026-03-04', '2026-03-04')
	];

	it('finds the lowest day, the earliest when two days tie', () => {
		const result = board(entries);

		expect(result.lowest?.date).toBe('2026-03-04');
		expect(result.lowest).toMatchObject({ availableCount: 2, totalPersonnel: 6 });
		expect(board([away('1', 'a1', 'leave', '2026-03-03', '2026-03-03'), away('2', 'b1', 'leave', '2026-03-05', '2026-03-05')]).lowest?.date).toBe(
			'2026-03-03'
		);
	});

	it('counts only the statuses picked as away', () => {
		const result = board(entries, { awayStatusTypeIds: new Set(['leave']) });

		expect(result.days.find((day) => day.date === '2026-03-04')).toMatchObject({
			unavailableCount: 2,
			availableCount: 4
		});
		expect(result.lowest?.date).toBe('2026-03-04');
	});

	it('counts days below 80% on the exact fraction and names groups that fall under half', () => {
		const result = board(entries);

		expect(result.daysUnderTarget).toBe(2);
		expect(result.groupsUnderHalf).toEqual(['Alpha']);
	});

	it('reports no lowest day, no days under target and no groups for an empty selection', () => {
		const result = board(entries, { personnel: [], selectedRootIds: new Set() });

		expect(result.lowest).toBeNull();
		expect(result.daysUnderTarget).toBe(0);
		expect(result.groupsUnderHalf).toEqual([]);
	});
});

describe('lowestCell', () => {
	it('ranks 159 of 200 below 4 of 5 although both read 80%', () => {
		const cell = (date: string, availableCount: number, totalPersonnel: number) => ({
			date,
			availableCount,
			totalPersonnel,
			availablePercent: 80
		});

		expect(lowestCell([cell('2026-03-01', 4, 5), cell('2026-03-02', 159, 200)])?.date).toBe('2026-03-02');
	});
});

describe('dayOnOrFirst', () => {
	const { days } = board([]);

	it('returns the named day when the range holds it', () => {
		expect(dayOnOrFirst(days, '2026-03-05')?.date).toBe('2026-03-05');
	});

	it('falls back to the first day when the range does not hold the date or none is given', () => {
		expect(dayOnOrFirst(days, '2026-04-01')?.date).toBe('2026-03-02');
		expect(dayOnOrFirst(days, null)?.date).toBe('2026-03-02');
	});
});

describe('dominantCauses', () => {
	const day = board([
		away('1', 'a1', 'leave', '2026-03-04', '2026-03-04'),
		away('2', 'a2', 'tdy', '2026-03-04', '2026-03-04'),
		away('3', 'b1', 'tdy', '2026-03-04', '2026-03-04'),
		away('4', 'b2', 'appt', '2026-03-04', '2026-03-04'),
		away('5', 'b3', 'tdy', '2026-03-04', '2026-03-04')
	]).days.find((candidate) => candidate.date === '2026-03-04')!;

	it('names the two largest statuses and counts the rest as other', () => {
		expect(dominantCauses(day)).toEqual({
			top: [
				{ statusTypeId: 'tdy', count: 3 },
				{ statusTypeId: 'leave', count: 1 }
			],
			otherCount: 1
		});
	});

	it('names every status when the limit covers them', () => {
		expect(dominantCauses(day, 5).otherCount).toBe(0);
	});
});

describe('groupWhoIsOut', () => {
	const day = board([
		away('1', 'a1', 'leave', '2026-03-04', '2026-03-05'),
		away('2', 'b1', 'tdy', '2026-03-04', '2026-03-04'),
		away('3', 'b2', 'tdy', '2026-03-04', '2026-03-09'),
		away('4', 'b3', 'appt', '2026-03-04', '2026-03-04'),
		away('5', 'a2', 'appt', '2026-03-04', '2026-03-04')
	]).days.find((candidate) => candidate.date === '2026-03-04')!;

	it('groups the absent by status with the largest group first and ties in Status Type order', () => {
		expect(groupWhoIsOut(day, statusTypes).map((group) => [group.statusName, group.people.length])).toEqual([
			['TDY', 2],
			['Appt', 2],
			['Leave', 1]
		]);
	});

	it('lists people by rank then name and spans the return dates of the group', () => {
		const tdy = groupWhoIsOut(day, statusTypes)[0];

		expect(tdy.people.map((away) => away.person.lastName)).toEqual(['Brown', 'Baker']);
		expect([tdy.earliestReturn, tdy.latestReturn]).toEqual(['2026-03-05', '2026-03-10']);
	});
});

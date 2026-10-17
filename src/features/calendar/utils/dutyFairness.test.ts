import { describe, expect, it } from 'vitest';
import type { AssignmentType, AvailabilityEntry, DailyAssignment } from '$features/calendar/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import { calendarReadRange } from './calendarRange';
import { dutyFairness, type DutyFairnessRow } from './dutyFairness';
import { indexDutyAvailability, indexDutyHistory } from './dutyReadModel';

const OCTOBER = { rangeStart: '2026-10-01', rangeEnd: '2026-10-31' };

const staffDuty: AssignmentType = {
	id: 'sd',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#b91c1c',
	exemptPersonnelIds: [],
	showOnCalendar: true,
	sortOrder: 0
};

function person(id: string, lastName: string, firstName = 'Pat'): Personnel {
	return { id, rank: 'SPC', lastName, firstName, mos: '', clinicRole: '', groupId: null, groupName: '' };
}

function duty(date: string, assigneeId: string, assignmentTypeId = 'sd'): DailyAssignment {
	return { id: `${assignmentTypeId}-${assigneeId}-${date}`, date, assignmentTypeId, assigneeId };
}

function away(personnelId: string, startDate: string, endDate: string): AvailabilityEntry {
	return { id: `${personnelId}-${startDate}`, personnelId, statusTypeId: 'leave', startDate, endDate };
}

const roster = [person('p-avery', 'Avery'), person('p-bell', 'Bell'), person('p-cole', 'Cole')];

function fairness(
	overrides: {
		assignments?: DailyAssignment[];
		entries?: AvailabilityEntry[];
		type?: AssignmentType;
		personnel?: Personnel[];
		groups?: Group[];
		month?: typeof OCTOBER;
		todayKey?: string;
	} = {}
) {
	const { assignments = [], entries = [], ...input } = overrides;
	return dutyFairness({
		type: staffDuty,
		month: OCTOBER,
		todayKey: '2026-10-17',
		personnel: roster,
		groups: [],
		history: indexDutyHistory(assignments),
		availabilityByPerson: indexDutyAvailability(entries),
		statusTypes: [{ id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#fff', shortLabel: null, sortOrder: 0 }],
		...input
	});
}

function unavailable(row: DutyFairnessRow) {
	return row.kind === 'personnel' ? row.unavailable : undefined;
}

function ranking(result: ReturnType<typeof fairness>) {
	return result.rows.map((row) => [row.label, row.count, row.lastDuty?.date ?? null]);
}

describe('dutyFairness', () => {
	it('counts the 90 days ending on the month end, including both end days and excluding the days outside', () => {
		const result = fairness({
			assignments: [
				duty('2026-08-02', 'p-avery'),
				duty('2026-08-03', 'p-bell'),
				duty('2026-10-31', 'p-cole'),
				duty('2026-11-01', 'p-avery')
			]
		});

		expect(result.window).toEqual({ start: '2026-08-03', end: '2026-10-31', label: '3 Aug – 31 Oct' });
		expect(ranking(result)).toEqual([
			['Avery, Pat', 0, null],
			['Bell, Pat', 1, '2026-08-03'],
			['Cole, Pat', 1, '2026-10-31']
		]);
	});

	it('stays inside the range a Calendar month read loads, for months of every length', () => {
		for (const [month, last] of [
			['2026-02', '2026-02-28'],
			['2026-04', '2026-04-30'],
			['2028-02', '2028-02-29'],
			['2026-12', '2026-12-31']
		]) {
			const read = calendarReadRange(new Date(`${month}-01T12:00:00`), 'month');
			const { window } = fairness({ month: { rangeStart: `${month}-01`, rangeEnd: last } });

			expect(window.start >= read.rangeStart).toBe(true);
			expect(window.end).toBe(read.rangeEnd);
		}
	});

	it('moves a person down as soon as a duty is planned later in the month', () => {
		const planned = [duty('2026-08-20', 'p-avery'), duty('2026-09-10', 'p-bell'), duty('2026-09-12', 'p-cole')];

		expect(ranking(fairness({ assignments: planned })).map(([label]) => label)).toEqual([
			'Avery, Pat',
			'Bell, Pat',
			'Cole, Pat'
		]);
		expect(ranking(fairness({ assignments: [...planned, duty('2026-10-24', 'p-avery')] }))).toEqual([
			['Bell, Pat', 1, '2026-09-10'],
			['Cole, Pat', 1, '2026-09-12'],
			['Avery, Pat', 2, '2026-10-24']
		]);
	});

	it('breaks a tie on the last duty date by fewer duties, then by name even when people arrive out of order', () => {
		const result = fairness({
			assignments: [
				duty('2026-08-10', 'p-aaron'),
				duty('2026-09-01', 'p-aaron'),
				duty('2026-09-01', 'p-cole'),
				duty('2026-09-01', 'p-bell'),
				duty('2026-09-01', 'p-bell-alex'),
				duty('2026-09-01', 'p-avery')
			],
			personnel: [
				person('p-aaron', 'Aaron'),
				person('p-cole', 'Cole'),
				person('p-bell', 'Bell'),
				person('p-bell-alex', 'Bell', 'Alex'),
				person('p-avery', 'Avery')
			]
		});

		expect(ranking(result)).toEqual([
			['Avery, Pat', 1, '2026-09-01'],
			['Bell, Alex', 1, '2026-09-01'],
			['Bell, Pat', 1, '2026-09-01'],
			['Cole, Pat', 1, '2026-09-01'],
			['Aaron, Pat', 2, '2026-09-01']
		]);
	});

	it('leaves out people the type exempts', () => {
		const result = fairness({ type: { ...staffDuty, exemptPersonnelIds: ['p-bell'] } });

		expect(ranking(result).map(([label]) => label)).toEqual(['Avery, Pat', 'Cole, Pat']);
	});

	it('ranks the Groups it is given for a Group type, and keeps types apart', () => {
		const groups: Group[] = [
			{ id: 'g-b', name: 'Bravo', sortOrder: 1 },
			{ id: 'g-a', name: 'Alpha', sortOrder: 0 }
		];
		const result = fairness({
			type: { ...staffDuty, id: 'cq', assignTo: 'group' },
			groups,
			assignments: [duty('2026-09-05', 'g-a', 'cq'), duty('2026-10-02', 'g-a', 'cq'), duty('2026-10-03', 'g-b')]
		});

		expect(ranking(result)).toEqual([
			['Bravo', 0, null],
			['Alpha', 2, '2026-10-02']
		]);
	});

	describe('unavailability', () => {
		const entries = [
			away('p-avery', '2026-10-05', '2026-10-17'),
			away('p-bell', '2026-10-30', '2026-11-04'),
			away('p-cole', '2026-10-01', '2026-10-16')
		];

		it('dims only people whose entry overlaps a day left to plan, with the entry as the reason', () => {
			const result = fairness({ entries });

			expect(result.rows.map((row) => [row.label, unavailable(row)])).toEqual([
				['Avery, Pat', 'Leave 5–17 Oct'],
				['Bell, Pat', 'Leave 30 Oct – 4 Nov'],
				['Cole, Pat', undefined]
			]);
		});

		it('lists every overlapping entry', () => {
			const result = fairness({
				entries: [away('p-avery', '2026-10-20', '2026-10-21'), away('p-avery', '2026-10-28', '2026-10-28')]
			});

			expect(unavailable(result.rows[0])).toBe('Leave 20–21 Oct; Leave 28 Oct');
		});

		it('dims no one in a month that is already over', () => {
			const result = fairness({
				month: { rangeStart: '2026-09-01', rangeEnd: '2026-09-30' },
				entries: [away('p-avery', '2026-09-20', '2026-10-20')]
			});

			expect(result.rows.map(unavailable)).toEqual([undefined, undefined, undefined]);
		});

		it('treats every day of a future month as still plannable', () => {
			const result = fairness({
				month: { rangeStart: '2026-11-01', rangeEnd: '2026-11-30' },
				entries: [away('p-avery', '2026-10-20', '2026-10-31'), away('p-bell', '2026-11-01', '2026-11-01')]
			});

			expect(result.rows.map((row) => [row.label, unavailable(row)])).toEqual([
				['Avery, Pat', undefined],
				['Bell, Pat', 'Leave 1 Nov'],
				['Cole, Pat', undefined]
			]);
		});
	});
});

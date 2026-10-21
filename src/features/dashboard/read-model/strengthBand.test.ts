import { describe, expect, it } from 'vitest';
import type { AvailabilityEntry, SpecialDay, StatusType } from '$features/calendar/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import { buildStrengthBand, formatForecastHeadline, type StrengthInputs } from './strengthBand';

const TODAY = '2026-10-19';
const DAYS = [
	'2026-10-19',
	'2026-10-20',
	'2026-10-21',
	'2026-10-22',
	'2026-10-23',
	'2026-10-24',
	'2026-10-25',
	'2026-10-26',
	'2026-10-27',
	'2026-10-28',
	'2026-10-29',
	'2026-10-30',
	'2026-10-31',
	'2026-11-01'
];

const STATUS_TYPES: StatusType[] = [
	{ id: 'sick', name: 'Sick', color: '#d9473f', textColor: '#fff', shortLabel: null, sortOrder: 4 },
	{ id: 'leave', name: 'Leave', color: '#5fb37a', textColor: '#fff', shortLabel: null, sortOrder: 0 },
	{ id: 'tdy', name: 'TDY', color: '#9a7ae0', textColor: '#fff', shortLabel: null, sortOrder: 1 },
	{ id: 'appt', name: 'Appt', color: '#e08a3c', textColor: '#fff', shortLabel: null, sortOrder: 3 }
];

function people(count: number, groupId: string | null = 'alpha', from = 1): Personnel[] {
	return Array.from({ length: count }, (_, index) => {
		const n = from + index;
		return {
			id: `p${n}`,
			rank: 'SPC',
			lastName: `Last${n}`,
			firstName: `First${n}`,
			mos: '68W',
			clinicRole: '',
			groupId,
			groupName: ''
		};
	});
}

let entryId = 0;
function away(ids: string[], statusTypeId: string, startDate: string, endDate: string): AvailabilityEntry[] {
	return ids.map((personnelId) => ({ id: `e${++entryId}`, personnelId, statusTypeId, startDate, endDate }));
}

function ids(from: number, to: number): string[] {
	return Array.from({ length: to - from + 1 }, (_, index) => `p${from + index}`);
}

function band(overrides: Partial<StrengthInputs>) {
	return buildStrengthBand({
		today: TODAY,
		forecastDays: DAYS,
		personnel: people(22),
		availability: [],
		statusTypes: STATUS_TYPES,
		specialDays: [],
		groups: [{ id: 'alpha', name: 'Alpha', sortOrder: 0 }],
		floorPercent: 80,
		...overrides
	});
}

function headlineOf(result: ReturnType<typeof band>) {
	return { headline: result.headline, text: formatForecastHeadline(result.headline, TODAY) };
}

function flaggedDates(result: ReturnType<typeof band>): string[] {
	return result.forecast.filter((column) => column.belowFloor).map((column) => column.date);
}

describe('forecast headline (frame 03)', () => {
	it('A: names the first run of duty days under the floor', () => {
		const result = band({
			availability: [
				...away(ids(1, 3), 'leave', '2026-10-19', '2026-11-01'),
				...away(ids(4, 6), 'tdy', '2026-10-26', '2026-10-29')
			]
		});

		expect(flaggedDates(result)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']);
		expect(headlineOf(result)).toEqual({
			headline: { kind: 'dips', floorPercent: 80, from: '2026-10-26', days: 4 },
			text: 'Below 80% on 4 days, from Monday 26th'
		});
	});

	it('B: stays above, giving the range and the lowest duty day', () => {
		const result = band({
			availability: [
				...away(['p1'], 'leave', '2026-10-19', '2026-11-01'),
				...away(ids(2, 4), 'tdy', '2026-10-30', '2026-10-30')
			]
		});

		expect(flaggedDates(result)).toEqual([]);
		expect(headlineOf(result)).toEqual({
			headline: { kind: 'above', min: 18, max: 21, lowest: '2026-10-30' },
			text: '18 to 21 available, lowest Friday 30th'
		});
	});

	it('B: says today when today is the lowest day', () => {
		const result = band({ availability: away(ids(1, 4), 'tdy', '2026-10-19', '2026-10-19') });

		expect(headlineOf(result)).toEqual({
			headline: { kind: 'above', min: 18, max: 22, lowest: '2026-10-19' },
			text: '18 to 22 available, lowest today'
		});
	});

	it('C: calls a fortnight that moves by one person or less steady', () => {
		const result = band({
			availability: [
				...away(['p1'], 'leave', '2026-10-19', '2026-11-01'),
				...away(['p2'], 'appt', '2026-10-20', '2026-10-20')
			]
		});

		expect(headlineOf(result)).toEqual({
			headline: { kind: 'steady', min: 20, max: 21 },
			text: 'Steady: 20 to 21 available every day'
		});
	});

	it('D: starts the run at today and names the duty day it recovers', () => {
		const result = band({ availability: away(ids(1, 6), 'sick', '2026-10-19', '2026-10-21') });

		expect(flaggedDates(result)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
		expect(result.bottomLine).toMatchObject({ available: 16, assigned: 22, percent: 73, belowFloor: true });
		expect(headlineOf(result)).toEqual({
			headline: { kind: 'underToday', floorPercent: 80, backAbove: '2026-10-22' },
			text: 'Below 80% today, back above on Thursday'
		});
	});

	it('keeps one run across a weekend, counting only its duty days', () => {
		const result = band({ availability: away(ids(1, 6), 'leave', '2026-10-23', '2026-10-26') });

		expect(flaggedDates(result)).toEqual(['2026-10-23', '2026-10-26']);
		expect(result.headline).toEqual({ kind: 'dips', floorPercent: 80, from: '2026-10-23', days: 2 });
	});
});

describe('duty days', () => {
	it('never flags a weekend that falls under the floor', () => {
		const result = band({ availability: away(ids(1, 6), 'leave', '2026-10-24', '2026-10-25') });

		expect(result.forecast.slice(5, 7)).toMatchObject([
			{ date: '2026-10-24', isDutyDay: false, available: 16, belowFloor: false },
			{ date: '2026-10-25', isDutyDay: false, available: 16, belowFloor: false }
		]);
		expect(flaggedDates(result)).toEqual([]);
	});

	it('never flags a stored closure day that falls under the floor', () => {
		const availability = away(ids(1, 6), 'sick', '2026-10-21', '2026-10-21');
		const closure: SpecialDay = { id: 'c1', date: '2026-10-21', name: 'Unit closure', type: 'org-closure' };

		expect(flaggedDates(band({ availability }))).toEqual(['2026-10-21']);
		expect(flaggedDates(band({ availability, specialDays: [closure] }))).toEqual([]);
		expect(band({ availability, specialDays: [closure] }).forecast[2]).toMatchObject({
			date: '2026-10-21',
			isDutyDay: false
		});
	});

	it('moves the flags with the floor alone, on the rounded percent', () => {
		const availability = away(ids(1, 5), 'sick', '2026-10-20', '2026-10-20');

		expect(flaggedDates(band({ availability, floorPercent: 80 }))).toEqual(['2026-10-20']);
		expect(flaggedDates(band({ availability, floorPercent: 77 }))).toEqual([]);
		expect(flaggedDates(band({ availability, floorPercent: 78 }))).toEqual(['2026-10-20']);
	});
});

describe('people, not entries', () => {
	it('counts a person with overlapping entries once and shows the status first in catalog order', () => {
		const result = band({
			availability: [
				...away(['p1'], 'sick', '2026-10-19', '2026-10-19'),
				...away(['p1'], 'leave', '2026-10-18', '2026-10-25'),
				...away(['p1'], 'appt', '2026-10-26', '2026-10-27'),
				...away(['p2'], 'tdy', '2026-10-19', '2026-10-22')
			]
		});

		expect(result.bottomLine.available).toBe(20);
		expect(result.bottomLine.strip).toEqual([
			{ statusTypeId: null, count: 20 },
			{ statusTypeId: 'leave', count: 1 },
			{ statusTypeId: 'tdy', count: 1 }
		]);
		expect(result.bottomLine.outPeople).toEqual([
			{
				personnelId: 'p1',
				name: 'SPC Last1, First1',
				statusTypeId: 'leave',
				back: '2026-10-28',
				backLabel: 'back 28 Oct'
			},
			{
				personnelId: 'p2',
				name: 'SPC Last2, First2',
				statusTypeId: 'tdy',
				back: '2026-10-23',
				backLabel: 'back 23 Oct'
			}
		]);
		expect(result.forecast[0].byStatus).toEqual([
			{ statusTypeId: 'leave', count: 1 },
			{ statusTypeId: 'tdy', count: 1 }
		]);
		expect(result.groups.rows).toEqual([
			{ id: 'alpha', name: 'Alpha', available: 20, assigned: 22, percent: 91, belowFloor: false }
		]);
	});

	it('ignores entries for people outside the scoped roster', () => {
		const result = band({ availability: away(['p99'], 'leave', '2026-10-19', '2026-10-25') });

		expect(result.bottomLine).toMatchObject({ available: 22, outPeople: [] });
	});
});

describe('bottom line scale (frame 02)', () => {
	it('names people at 40 or fewer', () => {
		const result = band({
			availability: [
				...away(['p1'], 'leave', '2026-10-15', '2026-10-25'),
				...away(['p2'], 'tdy', '2026-10-19', '2026-10-22'),
				...away(['p3'], 'sick', '2026-10-19', '2026-10-19'),
				...away(['p4'], 'leave', '2026-10-20', '2026-10-24'),
				...away(['p5'], 'appt', '2026-10-20', '2026-10-20')
			]
		});

		expect(result.bottomLine.mode).toBe('people');
		expect(result.bottomLine.outPeople.map((row) => [row.name, row.backLabel])).toEqual([
			['SPC Last1, First1', 'back 26 Oct'],
			['SPC Last2, First2', 'back 23 Oct'],
			['SPC Last3, First3', 'back tomorrow']
		]);
		expect(result.bottomLine.tomorrow).toBe(
			'Tomorrow 18. SPC Last4 starts Leave and SPC Last5 starts Appt; SPC Last3 returns.'
		);
	});

	it('switches to counts per status with source groups above 40 people', () => {
		const personnel = [...people(20, 'alpha', 1), ...people(15, 'bravo', 21), ...people(6, 'charlie', 36)];
		const result = band({
			personnel,
			groups: [
				{ id: 'alpha', name: 'Alpha', sortOrder: 0 },
				{ id: 'bravo', name: 'Bravo', sortOrder: 1 },
				{ id: 'charlie', name: 'Charlie', sortOrder: 2 }
			],
			availability: [
				...away(['p1', 'p2'], 'leave', '2026-10-17', '2026-10-19'),
				...away(['p3'], 'leave', '2026-10-19', '2026-10-22'),
				...away(['p21', 'p22'], 'leave', '2026-10-19', '2026-10-25'),
				...away(['p36'], 'leave', '2026-10-19', '2026-10-30'),
				...away(['p4'], 'tdy', '2026-10-19', '2026-10-21')
			]
		});

		expect(result.bottomLine).toMatchObject({ mode: 'counts', available: 34, assigned: 41, percent: 83 });
		expect(result.bottomLine.strip).toEqual([
			{ statusTypeId: null, count: 34 },
			{ statusTypeId: 'leave', count: 6 },
			{ statusTypeId: 'tdy', count: 1 }
		]);
		expect(result.bottomLine.outByStatus).toEqual([
			{ statusTypeId: 'leave', count: 6, originsLabel: 'Alpha 3 · Bravo 2 · 1 more', returnLabel: '2 back tomorrow' },
			{ statusTypeId: 'tdy', count: 1, originsLabel: 'Alpha 1', returnLabel: 'back 22 Oct' }
		]);
		expect(result.bottomLine.tomorrow).toBe('Tomorrow 36. 2 return.');
		expect(result.groups.rows.map((row) => [row.name, `${row.available}/${row.assigned}`, row.belowFloor])).toEqual([
			['Alpha', '16/20', false],
			['Charlie', '5/6', false],
			['Bravo', '13/15', false]
		]);
	});

	it('keeps 40 people in people mode', () => {
		expect(band({ personnel: people(40) }).bottomLine.mode).toBe('people');
		expect(band({ personnel: people(41) }).bottomLine.mode).toBe('counts');
	});
});

describe('by group', () => {
	function groupsBand(groupCount: number) {
		const groups: Group[] = Array.from({ length: groupCount }, (_, index) => ({
			id: `g${index + 1}`,
			name: `G${index + 1}`,
			sortOrder: index
		}));
		const personnel = groups.flatMap((group, index) => people(4, group.id, index * 4 + 1));
		return band({
			personnel,
			groups,
			availability: [
				...away(['p1', 'p2'], 'leave', '2026-10-19', '2026-10-19'),
				...away(['p9'], 'sick', '2026-10-19', '2026-10-19')
			]
		});
	}

	it('lists every group lowest first when there are 6 or fewer', () => {
		const result = groupsBand(6);

		expect(result.groups.shown).toBe(6);
		expect(result.groups.rows.map((row) => [row.name, row.percent, row.belowFloor])).toEqual([
			['G1', 50, true],
			['G3', 75, true],
			['G2', 100, false],
			['G4', 100, false],
			['G5', 100, false],
			['G6', 100, false]
		]);
	});

	it('shows the lowest 5 when there are more than 6', () => {
		const result = groupsBand(7);

		expect(result.groups.rows).toHaveLength(7);
		expect(result.groups.shown).toBe(5);
		expect(result.groups.rows.slice(0, 2).map((row) => row.name)).toEqual(['G1', 'G3']);
	});
});

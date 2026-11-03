import { describe, expect, it } from 'vitest';
import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import { NESTED_GROUPS } from '$lib/test-support/nestedGroups';
import { computeTimeAway, flagDays, niceScale, rankPeople, summarizeTimeAway, type TimeAwayInput } from './timeAway';

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
	return {
		id,
		name,
		color: `#00000${sortOrder}`,
		textColor: '#ffffff',
		shortLabel: null,
		rosterEffect: 'A',
		sortOrder
	};
}

const statusTypes = [
	status('leave', 'Leave', 0),
	status('tdy', 'TDY', 1),
	status('appt', 'Appt', 2),
	status('sick', 'Sick', 3)
];
const groups: Group[] = [
	{ id: 'alpha', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 },
	{ id: 'bravo', name: 'Bravo', sortOrder: 1, parentId: null, depth: 1 }
];
const able = person('able', 'Able', 'alpha');
const adams = person('adams', 'Adams', 'alpha');
const baker = person('baker', 'Baker', 'bravo');
const bell = person('bell', 'Bell', 'bravo');

// A 10-day span, 1 to 10 March 2026, for four people.
const entries: AvailabilityEntry[] = [
	// Able: leave 1-3 (starts before the span), then TDY from 8 that runs past the end.
	away('e1', 'able', 'leave', '2026-02-27', '2026-03-03'),
	away('e2', 'able', 'tdy', '2026-03-08', '2026-03-14'),
	// Adams: leave 4-5 and an appointment 5-6; 5 March counts once, under the entry listed first.
	away('e3', 'adams', 'leave', '2026-03-04', '2026-03-05'),
	away('e4', 'adams', 'appt', '2026-03-05', '2026-03-06'),
	// Adams goes out again on 30 March and, first, on 20 March.
	away('e5', 'adams', 'tdy', '2026-03-30', '2026-04-02'),
	away('e6', 'adams', 'appt', '2026-03-20', '2026-03-21'),
	// Baker: sick, which is not counted as away below.
	away('e7', 'baker', 'sick', '2026-03-02', '2026-03-03'),
	// Bell: leave the whole span, and an earlier stretch outside it.
	away('e8', 'bell', 'leave', '2026-03-01', '2026-03-10'),
	away('e9', 'bell', 'leave', '2026-02-01', '2026-02-05')
];

function report(overrides: Partial<TimeAwayInput> = {}) {
	return computeTimeAway({
		personnel: [able, adams, baker, bell],
		entries,
		statusTypes,
		awayStatusTypeIds: new Set(['leave', 'tdy', 'appt']),
		groups,
		showSubGroups: true,
		startDate: '2026-03-01',
		endDate: '2026-03-10',
		...overrides
	});
}

describe('computeTimeAway', () => {
	it('counts the share of person-days away over the span only', () => {
		const result = report();

		expect(result.spanDays).toBe(10);
		expect(result.personDays).toBe(40);
		expect(result.awayDays).toBe(19);
		expect(result.awayShare).toBe(0.475);
		expect(result.averagePerPerson).toBe(4.75);
		expect(result.neverAway).toBe(1);
	});

	it('counts a day once for a person, under the first entry that covers it, and clips entries to the span', () => {
		const people = Object.fromEntries(report().people.map((entry) => [entry.person.id, entry]));

		expect(people.able.totalDays).toBe(6);
		expect(people.able.byStatus).toEqual([
			{ statusTypeId: 'leave', days: 3 },
			{ statusTypeId: 'tdy', days: 3 }
		]);
		expect(people.adams.byStatus).toEqual([
			{ statusTypeId: 'leave', days: 2 },
			{ statusTypeId: 'appt', days: 1 }
		]);
		expect(people.adams.totalDays).toBe(3);
		expect(people.bell.totalDays).toBe(10);
	});

	it('leaves out statuses that do not count as away, from days and from next out alike', () => {
		const people = Object.fromEntries(report().people.map((entry) => [entry.person.id, entry]));
		expect(people.baker.totalDays).toBe(0);

		const sickCounts = Object.fromEntries(
			report({ awayStatusTypeIds: new Set(['sick']) }).people.map((entry) => [entry.person.id, entry.totalDays])
		);
		expect(sickCounts).toEqual({ able: 0, adams: 0, baker: 2, bell: 0 });
	});

	it('finds the next day out after the span, and whether the person never came back', () => {
		const people = Object.fromEntries(report().people.map((entry) => [entry.person.id, entry]));

		expect(people.able.nextOut).toEqual({ statusTypeId: 'tdy', date: '2026-03-11', ongoing: true });
		expect(people.adams.nextOut).toEqual({ statusTypeId: 'appt', date: '2026-03-20', ongoing: false });
		expect(people.baker.nextOut).toBeNull();
		expect(people.bell.nextOut).toBeNull();
	});

	it("orders a person's statuses by the catalog, not by the order entries arrived", () => {
		const result = report({
			personnel: [able],
			entries: [
				away('r1', 'able', 'appt', '2026-03-01', '2026-03-01'),
				away('r2', 'able', 'tdy', '2026-03-02', '2026-03-02'),
				away('r3', 'able', 'leave', '2026-03-03', '2026-03-03')
			]
		});

		expect(result.people[0].byStatus.map((status) => status.statusTypeId)).toEqual(['leave', 'tdy', 'appt']);
	});

	it('splits the days by status, the largest status first', () => {
		expect(report().byStatus).toEqual([
			{ statusTypeId: 'leave', days: 15, share: 15 / 19 },
			{ statusTypeId: 'tdy', days: 3, share: 3 / 19 },
			{ statusTypeId: 'appt', days: 1, share: 1 / 19 }
		]);
	});

	it('reports days away per person for each Group', () => {
		const [alpha, bravo] = report().groups.map((set) => set.top);

		expect(alpha).toMatchObject({ key: 'alpha', label: 'Alpha', people: 2, totalDays: 9, perPerson: 4.5 });
		expect(alpha.byStatus).toEqual([
			{ statusTypeId: 'leave', perPerson: 2.5 },
			{ statusTypeId: 'tdy', perPerson: 1.5 },
			{ statusTypeId: 'appt', perPerson: 0.5 }
		]);
		expect(bravo).toMatchObject({ key: 'bravo', people: 2, totalDays: 10, perPerson: 5 });
	});

	it('shows sub-groups under a Group only when asked', () => {
		const nested = (showSubGroups: boolean) =>
			computeTimeAway({
				personnel: [person('p1', 'Pike', 'alpha'), person('p2', 'Park', 'bravo'), person('p3', 'Poe', 'platoon')],
				entries: [
					away('n1', 'p1', 'leave', '2026-03-01', '2026-03-04'),
					away('n2', 'p3', 'leave', '2026-03-01', '2026-03-02')
				],
				statusTypes,
				awayStatusTypeIds: new Set(['leave']),
				groups: NESTED_GROUPS,
				showSubGroups,
				startDate: '2026-03-01',
				endDate: '2026-03-10'
			}).groups;

		const [platoon] = nested(true);
		expect(platoon.top).toMatchObject({ label: '1st Platoon', people: 3, totalDays: 6, perPerson: 2 });
		expect(platoon.below.map((row) => [row.label, row.people, row.perPerson])).toEqual([
			['1st Platoon HQ', 1, 2],
			['2nd Squad', 2, 2],
			['Alpha Team', 1, 4],
			['Bravo Team', 1, 0]
		]);
		expect(nested(false)[0].below).toEqual([]);
	});

	it('reads as nobody away for an empty selection, with no NaN', () => {
		const result = report({ personnel: [] });

		expect(result).toMatchObject({ peopleCount: 0, personDays: 0, awayDays: 0, awayShare: 0, averagePerPerson: 0 });
		expect(result.byStatus).toEqual([]);
		expect(result.groups).toEqual([]);
	});
});

describe('summarizeTimeAway', () => {
	it('counts people at the flag or beyond, and those who go out again', () => {
		expect(summarizeTimeAway(report(), 6)).toMatchObject({ flagged: 2, flaggedOutAgain: 1 });
		expect(summarizeTimeAway(report(), 7)).toMatchObject({ flagged: 1, flaggedOutAgain: 0 });
		expect(summarizeTimeAway(report(), 11)).toMatchObject({ flagged: 0, flaggedOutAgain: 0 });
	});

	it('names the Group with the most days away per person', () => {
		expect(summarizeTimeAway(report(), 6).busiestGroup?.label).toBe('Bravo');
	});

	it('names no busiest Group when only one has people', () => {
		expect(summarizeTimeAway(report({ personnel: [able, adams] }), 6).busiestGroup).toBeNull();
	});
});

describe('rankPeople', () => {
	const people = report().people;

	it('puts the most away first, or the least away first', () => {
		expect(rankPeople(people, 'most').map((entry) => entry.person.id)).toEqual(['bell', 'able', 'adams', 'baker']);
		expect(rankPeople(people, 'least').map((entry) => entry.person.id)).toEqual(['baker', 'adams', 'able', 'bell']);
	});

	it('breaks a tie by rank, then name, in both orders', () => {
		const tied = computeTimeAway({
			personnel: [
				person('a', 'Zed', 'alpha', 'SGT'),
				person('b', 'Ames', 'alpha', 'SGT'),
				person('c', 'Lee', 'alpha', 'SSG')
			],
			entries: [],
			statusTypes,
			awayStatusTypeIds: new Set(['leave']),
			groups,
			showSubGroups: false,
			startDate: '2026-03-01',
			endDate: '2026-03-10'
		}).people;

		expect(rankPeople(tied, 'most').map((entry) => entry.person.lastName)).toEqual(['Lee', 'Ames', 'Zed']);
		expect(rankPeople(tied, 'least').map((entry) => entry.person.lastName)).toEqual(['Lee', 'Ames', 'Zed']);
	});
});

describe('flagDays', () => {
	it('flags at a third of the span by default, rounded to a whole day', () => {
		expect(flagDays(90, 'third')).toBe(30);
		expect(flagDays(60, 'third')).toBe(20);
		expect(flagDays(14, 'third')).toBe(5);
	});

	it('keeps the other choices proportional to the span', () => {
		expect(flagDays(90, 'half')).toBe(45);
		expect(flagDays(30, 'quarter')).toBe(8);
		expect(flagDays(14, 'sixth')).toBe(2);
	});
});

describe('niceScale', () => {
	it('rounds the axis up to a step of 1, 2 or 5 times a power of ten, with at most five steps', () => {
		expect(niceScale(16.9)).toEqual({ max: 20, ticks: [0, 5, 10, 15, 20] });
		expect(niceScale(4)).toEqual({ max: 4, ticks: [0, 1, 2, 3, 4] });
		expect(niceScale(8.4)).toEqual({ max: 10, ticks: [0, 2, 4, 6, 8, 10] });
		expect(niceScale(60)).toEqual({ max: 60, ticks: [0, 20, 40, 60] });
	});

	it('gives an empty chart an axis of one', () => {
		expect(niceScale(0)).toEqual({ max: 1, ticks: [0, 1] });
	});
});

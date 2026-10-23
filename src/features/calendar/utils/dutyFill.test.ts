import { describe, expect, it } from 'vitest';
import type { AssignmentType, AvailabilityEntry, RosterDay } from '$features/calendar/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import { planDutyFill, type DutyFillDay } from './dutyFill';
import { indexDutyAvailability } from './dutyReadModel';

const staffDuty: AssignmentType = {
	id: 'sd',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#b91c1c',
	poolRules: null,
	weekendMode: 'same',
	excusals: [{ personId: 'p-exempt', reason: 'Profile', startsOn: '2026-01-01' }],
	showOnCalendar: true,
	sortOrder: 0
};

function person(id: string, lastName: string): Personnel {
	return { id, rank: 'SPC', lastName, firstName: 'A', mos: '', clinicRole: '', groupId: null, groupName: '' };
}

function leave(personnelId: string, startDate: string, endDate: string): AvailabilityEntry {
	return { id: `${personnelId}-${startDate}`, personnelId, statusTypeId: 'leave', startDate, endDate };
}

/** A detail day's standing, in the order the server sends it: highest count first. */
function detail(...standing: [personId: string, count: number, leave?: true][]): RosterDay {
	return {
		track: 'weekday',
		standing: standing.map(([personId, count, onLeave]) => ({
			personId,
			count,
			effect: onLeave ? { code: 'A', reason: 'Leave' } : null
		}))
	};
}

const personnel = [
	person('p-adams', 'Adams'),
	person('p-baker', 'Baker'),
	person('p-cole', 'Cole'),
	person('p-dunn', 'Dunn'),
	person('p-exempt', 'Able')
];

const DATES = ['2026-10-27', '2026-10-28', '2026-10-29'];

function plan(
	overrides: {
		days?: Omit<DutyFillDay, 'date'>[];
		entries?: AvailabilityEntry[];
		picks?: [string, string][];
		type?: AssignmentType;
		groups?: Group[];
	} = {}
) {
	return planDutyFill({
		type: overrides.type ?? staffDuty,
		days: DATES.map((date, index) => ({ date, ...overrides.days?.[index] })),
		personnel,
		groups: overrides.groups ?? [],
		availabilityByPerson: indexDutyAvailability(overrides.entries ?? []),
		statusTypes: [
			{
				id: 'leave',
				name: 'Leave',
				color: '#16a34a',
				textColor: '#fff',
				shortLabel: null,
				rosterEffect: 'A',
				sortOrder: 0
			}
		],
		picks: new Map(overrides.picks ?? [])
	});
}

const choices = (slots: ReturnType<typeof plan>) =>
	slots.map((slot) => [slot.date, slot.choice?.id ?? null, slot.picked]);

// Dunn is outside the pool on every day, so the roster never suggests him.
const ROSTER = [
	{ roster: detail(['p-cole', 14], ['p-baker', 9], ['p-adams', 3]) },
	{ roster: detail(['p-cole', 15], ['p-baker', 10], ['p-adams', 4]) },
	{ roster: detail(['p-cole', 16], ['p-baker', 11, true], ['p-adams', 5]) }
];

describe('planDutyFill', () => {
	it("suggests each day's roster next up, never twice, skipping anyone the roster marks unavailable", () => {
		const slots = plan({ days: ROSTER });

		expect(choices(slots)).toEqual([
			['2026-10-27', 'p-cole', false],
			['2026-10-28', 'p-baker', false],
			['2026-10-29', 'p-adams', false]
		]);
		expect(slots[2].options.map((option) => [option.id, option.kind === 'personnel' && option.count])).toEqual([
			['p-cole', 16],
			['p-baker', 11],
			['p-adams', 5],
			['p-dunn', undefined]
		]);
	});

	it('leaves a day empty rather than suggest someone off the roster', () => {
		const slots = plan({ days: [ROSTER[0], ROSTER[1], { roster: detail(['p-cole', 16], ['p-baker', 11]) }] });

		expect(choices(slots)).toEqual([
			['2026-10-27', 'p-cole', false],
			['2026-10-28', 'p-baker', false],
			['2026-10-29', null, false]
		]);
		expect(slots[2].options.find((option) => option.id === 'p-dunn')).toMatchObject({ offRoster: true });
	});

	it('keeps the viewer pick, even someone off the roster, and moves the others up', () => {
		expect(choices(plan({ days: ROSTER, picks: [['2026-10-27', 'p-dunn']] }))).toEqual([
			['2026-10-27', 'p-dunn', true],
			['2026-10-28', 'p-cole', false],
			['2026-10-29', 'p-adams', false]
		]);
	});

	it('suggests nobody on a day whose roster is loading or failed, and keeps everyone for a search after a failure', () => {
		const slots = plan({ days: [{ unreadRoster: 'loading' }, { unreadRoster: 'error' }, ROSTER[2]] });

		expect(choices(slots)).toEqual([
			['2026-10-27', null, false],
			['2026-10-28', null, false],
			['2026-10-29', 'p-cole', false]
		]);
		expect(slots[0].options).toEqual([]);
		expect(
			slots[1].options.map((option) => [option.id, option.kind === 'personnel' && option.countUnavailable])
		).toEqual([
			['p-adams', true],
			['p-baker', true],
			['p-cole', true],
			['p-dunn', true]
		]);
	});

	it('without a roster suggests people available that day in name order, never an excused one', () => {
		expect(choices(plan({ entries: [leave('p-adams', '2026-10-26', '2026-10-27')] }))).toEqual([
			['2026-10-27', 'p-baker', false],
			['2026-10-28', 'p-adams', false],
			['2026-10-29', 'p-cole', false]
		]);
	});

	it('suggests each group once, in name order, for a group duty', () => {
		const groups = [
			{ id: 'g-bravo', name: 'Bravo', sortOrder: 1 },
			{ id: 'g-alpha', name: 'Alpha', sortOrder: 0 }
		] as Group[];
		expect(choices(plan({ type: { ...staffDuty, assignTo: 'group' }, groups }))).toEqual([
			['2026-10-27', 'g-alpha', false],
			['2026-10-28', 'g-bravo', false],
			['2026-10-29', null, false]
		]);
	});
});

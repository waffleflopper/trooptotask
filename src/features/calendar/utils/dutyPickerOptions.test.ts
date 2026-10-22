import { describe, expect, it } from 'vitest';
import type { AssignmentType, AvailabilityEntry, RosterDay } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import { dutyPickerOptions, dutySearchScore, type DutyPickerInput } from './dutyPickerOptions';
import { indexDutyAvailability } from './dutyReadModel';

const staffDuty: AssignmentType = {
	id: 'sd',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#b91c1c',
	poolRules: null,
	weekendMode: 'same',
	excusals: [{ personId: 'p-kim', reason: 'Excused', startsOn: '2026-01-01' }],
	showOnCalendar: true,
	sortOrder: 0
};

function person(id: string, rank: string, lastName: string, firstName: string): Personnel {
	return { id, rank, lastName, firstName, mos: '', clinicRole: '', groupId: null, groupName: '' };
}

function leave(personnelId: string, startDate: string, endDate: string): AvailabilityEntry {
	return { id: `${personnelId}-${startDate}`, personnelId, statusTypeId: 'leave', startDate, endDate };
}

const roster = [
	person('p-ortiz-b', 'SPC', 'Ortiz', 'Lucia'),
	person('p-kim', 'SGT', 'Kim', 'Jae-won'),
	person('p-ortiz-a', 'PFC', 'Ortiz', 'Lucia'),
	person('p-reed', 'PV2', 'Reed', 'Sam'),
	person('p-hale', 'SSG', 'Hale', 'Corey'),
	person('p-ortiz-c', 'SGT', 'Ortiz', 'Ana'),
	person('p-liang', 'SPC', 'Liang', 'Wei')
];

function options(overrides: { entries?: AvailabilityEntry[] } & Partial<DutyPickerInput> = {}) {
	const { entries = [], ...input } = overrides;
	return dutyPickerOptions({
		type: staffDuty,
		dateKey: '2026-10-27',
		personnel: roster,
		groups: [],
		availabilityByPerson: indexDutyAvailability(entries),
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
		currentAssigneeId: 'p-hale',
		...input
	});
}

describe('dutyPickerOptions', () => {
	it('without roster counts, omits excused people and orders by name with a stable tie-break', () => {
		expect(options().map((option) => [option.id, option.label, option.current])).toEqual([
			['p-hale', 'Hale, Corey', true],
			['p-liang', 'Liang, Wei', false],
			['p-ortiz-c', 'Ortiz, Ana', false],
			['p-ortiz-a', 'Ortiz, Lucia', false],
			['p-ortiz-b', 'Ortiz, Lucia', false],
			['p-reed', 'Reed, Sam', false]
		]);
	});

	it("with roster counts, lists the pool in the roster's order and everyone else after it, off the roster", () => {
		const roster: RosterDay = {
			track: 'all',
			standing: [
				{ personId: 'p-reed', count: 12, effect: null },
				{ personId: 'p-liang', count: 12, effect: { code: 'A', reason: 'Leave' } },
				{ personId: 'p-hale', count: 9, effect: { code: 'D', reason: 'CQ' } },
				{ personId: 'p-gone', count: 4, effect: null }
			]
		};

		expect(
			options({ roster }).map((option) =>
				option.kind === 'personnel'
					? [option.id, option.count, option.unavailable, option.offRoster, option.current]
					: [option.id]
			)
		).toEqual([
			['p-reed', 12, undefined, false, false],
			['p-liang', 12, 'Leave (A)', false, false],
			['p-hale', 9, 'CQ (D)', false, true],
			['p-kim', undefined, undefined, true, false],
			['p-ortiz-c', undefined, undefined, true, false],
			['p-ortiz-a', undefined, undefined, true, false],
			['p-ortiz-b', undefined, undefined, true, false]
		]);
	});

	it('on a day the roster does not detail, lists the pool without counts and everyone else off the roster', () => {
		const roster: RosterDay = { track: null, pool: ['p-reed', 'p-hale', 'p-gone'] };

		expect(
			options({ roster, entries: [leave('p-hale', '2026-10-27', '2026-10-27')] }).map((option) =>
				option.kind === 'personnel' ? [option.id, option.count, option.offRoster, !!option.unavailable] : [option.id]
			)
		).toEqual([
			['p-reed', undefined, false, false],
			['p-hale', undefined, false, true],
			['p-kim', undefined, true, false],
			['p-liang', undefined, true, false],
			['p-ortiz-c', undefined, true, false],
			['p-ortiz-a', undefined, true, false],
			['p-ortiz-b', undefined, true, false]
		]);
	});

	it('keeps an unavailable person, naming every covering entry', () => {
		const result = options({
			entries: [
				leave('p-liang', '2026-10-26', '2026-11-03'),
				leave('p-liang', '2026-10-27', '2026-10-27'),
				leave('p-hale', '2026-10-20', '2026-10-26'),
				leave('p-reed', '2026-10-28', '2026-10-30')
			]
		});

		const unavailable = result.find((option) => option.id === 'p-liang');
		expect(unavailable).toMatchObject({ unavailable: expect.stringContaining('26 Oct – 3 Nov') });
		expect(unavailable).toMatchObject({ unavailable: expect.stringContaining('27 Oct') });
		expect(result.find((option) => option.id === 'p-hale')).toMatchObject({ unavailable: undefined });
		expect(result.find((option) => option.id === 'p-reed')).toMatchObject({ unavailable: undefined });
	});

	it('lists Groups by name for a Group duty with no exemptions, availability or history', () => {
		const result = options({
			type: {
				...staffDuty,
				assignTo: 'group',
				excusals: [{ personId: 'g-b', reason: 'Excused', startsOn: '2026-01-01' }]
			},
			groups: [
				{ id: 'g-b', name: 'Bravo', sortOrder: 0 },
				{ id: 'g-a', name: 'Alpha', sortOrder: 1 }
			],
			currentAssigneeId: 'g-b'
		});

		expect(result).toEqual([
			{ kind: 'group', id: 'g-a', label: 'Alpha', current: false },
			{ kind: 'group', id: 'g-b', label: 'Bravo', current: true }
		]);
	});
});

describe('dutySearchScore', () => {
	it('matches words in any order across the name and the rank, ignoring case', () => {
		expect(dutySearchScore('p-1', 'lucia  ORTIZ', ['Ortiz, Lucia', 'SPC'])).toBe(1);
		expect(dutySearchScore('p-1', 'spc ortiz', ['Ortiz, Lucia', 'SPC'])).toBe(1);
		expect(dutySearchScore('p-1', 'sgt ortiz', ['Ortiz, Lucia', 'SPC'])).toBe(0);
	});
});

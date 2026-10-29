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
			},
			{
				id: 'appointment',
				name: 'Appointment',
				color: '#2563eb',
				textColor: '#fff',
				shortLabel: null,
				rosterEffect: 'available',
				sortOrder: 1
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
			['p-liang', undefined, true, false],
			['p-ortiz-c', undefined, true, false],
			['p-ortiz-a', undefined, true, false],
			['p-ortiz-b', undefined, true, false]
		]);
	});

	it("before the roster's DA 6, on a day that would not count, offers everyone not excused in name order", () => {
		const roster: RosterDay = { track: null, formStartsOn: '2026-10-30', movesStart: false };

		expect(
			options({ roster }).map((option) =>
				option.kind === 'personnel' ? [option.id, option.count, option.offRoster] : [option.id]
			)
		).toEqual([
			['p-hale', undefined, false],
			['p-liang', undefined, false],
			['p-ortiz-c', undefined, false],
			['p-ortiz-a', undefined, false],
			['p-ortiz-b', undefined, false],
			['p-reed', undefined, false]
		]);
	});

	it('offers no one while the roster day is unread, so nothing is picked before the counts arrive', () => {
		expect(options({ unreadRoster: 'loading' })).toEqual([]);
	});

	it('tags everyone not excused as count unavailable when the roster day failed, current assignee included', () => {
		expect(
			options({ unreadRoster: 'error' }).map((option) =>
				option.kind === 'personnel'
					? [option.id, option.count, option.countUnavailable, option.offRoster, option.current]
					: [option.id]
			)
		).toEqual([
			['p-hale', undefined, true, false, true],
			['p-liang', undefined, true, false, false],
			['p-ortiz-c', undefined, true, false, false],
			['p-ortiz-a', undefined, true, false, false],
			['p-ortiz-b', undefined, true, false, false],
			['p-reed', undefined, true, false, false]
		]);
	});

	it('lists Groups as usual for a Group duty whatever the roster read is doing', () => {
		const groupDuty: AssignmentType = { ...staffDuty, assignTo: 'group' };
		const groups = [
			{ id: 'g-b', name: 'Bravo', sortOrder: 1, parentId: null, depth: 1 as const },
			{ id: 'g-a', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const }
		];

		expect(options({ type: groupDuty, groups, unreadRoster: 'error' }).map((option) => option.label)).toEqual([
			'Alpha',
			'Bravo'
		]);
	});

	it('offers a Group at any level by its path, each under the Group above it', () => {
		const groupDuty: AssignmentType = { ...staffDuty, assignTo: 'group' };
		const groups = [
			{ id: 'p2', name: '2nd Platoon', sortOrder: 1, parentId: null, depth: 1 as const },
			{ id: 's1', name: '1st Squad', sortOrder: 0, parentId: 'p2', depth: 2 as const },
			{ id: 'p1', name: '1st Platoon', sortOrder: 0, parentId: null, depth: 1 as const },
			{ id: 'p1s1', name: '1st Squad', sortOrder: 0, parentId: 'p1', depth: 2 as const }
		];

		expect(options({ type: groupDuty, groups }).map((option) => [option.id, option.label])).toEqual([
			['p1', '1st Platoon'],
			['p1s1', '1st Platoon › 1st Squad'],
			['p2', '2nd Platoon'],
			['s1', '2nd Platoon › 1st Squad']
		]);
	});

	it('keeps an excused person out of the off-roster search list, as it does without a roster', () => {
		const roster: RosterDay = { track: null, pool: ['p-reed'] };

		expect(options({ roster }).map((option) => option.id)).not.toContain('p-kim');
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

	it('offers a person whose only status that day is Still available, with or without a roster', () => {
		const entries: AvailabilityEntry[] = [
			{
				id: 'a-reed',
				personnelId: 'p-reed',
				statusTypeId: 'appointment',
				startDate: '2026-10-27',
				endDate: '2026-10-27'
			},
			{
				id: 'a-liang',
				personnelId: 'p-liang',
				statusTypeId: 'appointment',
				startDate: '2026-10-27',
				endDate: '2026-10-27'
			},
			leave('p-liang', '2026-10-27', '2026-10-27')
		];
		const unavailableOf = (result: ReturnType<typeof options>) =>
			result.flatMap((option) =>
				option.kind === 'personnel' && (option.id === 'p-reed' || option.id === 'p-liang')
					? [[option.id, option.unavailable]]
					: []
			);

		expect(unavailableOf(options({ entries }))).toEqual([
			['p-liang', 'Leave 27 Oct'],
			['p-reed', undefined]
		]);
		expect(unavailableOf(options({ entries, roster: { track: null, pool: ['p-reed', 'p-liang'] } }))).toEqual([
			['p-reed', undefined],
			['p-liang', 'Leave 27 Oct']
		]);
		expect(unavailableOf(options({ entries, roster: { track: null, pool: ['p-hale'] } }))).toEqual([
			['p-liang', 'Leave 27 Oct'],
			['p-reed', undefined]
		]);
	});

	it('lists Groups by name for a Group duty with no exemptions, availability or history', () => {
		const result = options({
			type: {
				...staffDuty,
				assignTo: 'group',
				excusals: [{ personId: 'g-b', reason: 'Excused', startsOn: '2026-01-01' }]
			},
			groups: [
				{ id: 'g-b', name: 'Bravo', sortOrder: 0, parentId: null, depth: 1 as const },
				{ id: 'g-a', name: 'Alpha', sortOrder: 1, parentId: null, depth: 1 as const }
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

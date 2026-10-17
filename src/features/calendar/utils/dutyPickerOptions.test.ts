import { describe, expect, it } from 'vitest';
import type { AssignmentType, AvailabilityEntry, DailyAssignment } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import { dutyPickerOptions, dutySearchScore, eligibleAssignees, type DutyPickerInput } from './dutyPickerOptions';
import { indexDutyAvailability, indexDutyHistory } from './dutyReadModel';

const staffDuty: AssignmentType = {
	id: 'sd',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#b91c1c',
	exemptPersonnelIds: ['p-kim'],
	showOnCalendar: true,
	sortOrder: 0
};

function person(id: string, rank: string, lastName: string, firstName: string): Personnel {
	return { id, rank, lastName, firstName, mos: '', clinicRole: '', groupId: null, groupName: '' };
}

function leave(personnelId: string, startDate: string, endDate: string): AvailabilityEntry {
	return { id: `${personnelId}-${startDate}`, personnelId, statusTypeId: 'leave', startDate, endDate };
}

function duty(id: string, date: string, assigneeId: string, assignmentTypeId = 'sd'): DailyAssignment {
	return { id, organizationId: 'org', date, assignmentTypeId, assigneeId };
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

function options(
	overrides: { assignments?: DailyAssignment[]; entries?: AvailabilityEntry[] } & Partial<DutyPickerInput> = {}
) {
	const { assignments = [], entries = [], ...input } = overrides;
	return dutyPickerOptions({
		type: staffDuty,
		dateKey: '2026-10-27',
		personnel: roster,
		groups: [],
		availabilityByPerson: indexDutyAvailability(entries),
		history: indexDutyHistory(assignments),
		statusTypes: [{ id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#fff', shortLabel: null, sortOrder: 0 }],
		currentAssigneeId: 'p-hale',
		...input
	});
}

describe('dutyPickerOptions', () => {
	it('omits exempt people and, with no history, orders by name with a stable tie-break', () => {
		expect(options().map((option) => [option.id, option.label, option.current])).toEqual([
			['p-hale', 'Hale, Corey', true],
			['p-liang', 'Liang, Wei', false],
			['p-ortiz-c', 'Ortiz, Ana', false],
			['p-ortiz-a', 'Ortiz, Lucia', false],
			['p-ortiz-b', 'Ortiz, Lucia', false],
			['p-reed', 'Reed, Sam', false]
		]);
	});

	it('puts people with no duty in 90 days first, then the longest since their last duty', () => {
		const result = options({
			assignments: [
				duty('a', '2026-10-01', 'p-hale'),
				duty('b', '2026-08-10', 'p-reed'),
				duty('c', '2026-10-01', 'p-liang'),
				duty('d', '2026-07-28', 'p-ortiz-a'),
				duty('e', '2026-10-26', 'p-ortiz-c', 'other-type')
			]
		});

		expect(result.map((option) => [option.id, option.kind === 'personnel' ? option.lastDuty : null])).toEqual([
			['p-ortiz-c', { kind: 'none' }],
			['p-ortiz-a', { kind: 'none' }],
			['p-ortiz-b', { kind: 'none' }],
			['p-reed', { kind: 'previous', date: '2026-08-10', daysSince: 78 }],
			['p-hale', { kind: 'previous', date: '2026-10-01', daysSince: 26 }],
			['p-liang', { kind: 'previous', date: '2026-10-01', daysSince: 26 }]
		]);
	});

	it('keeps an unavailable person, naming every covering entry', () => {
		const result = options({
			entries: [
				leave('p-liang', '2026-10-26', '2026-11-03'),
				leave('p-liang', '2026-10-27', '2026-10-27'),
				leave('p-hale', '2026-10-20', '2026-10-26')
			]
		});

		expect(result.find((option) => option.id === 'p-liang')).toMatchObject({
			unavailable: 'Leave 26 Oct – 3 Nov; Leave 27 Oct'
		});
		expect(result.find((option) => option.id === 'p-hale')).toMatchObject({ unavailable: undefined });
	});

	it('lists Groups by name for a Group duty with no exemptions, availability or history', () => {
		const result = options({
			type: { ...staffDuty, assignTo: 'group', exemptPersonnelIds: ['g-b'] },
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

describe('eligibleAssignees', () => {
	it('excludes the people a duty type exempts', () => {
		expect(eligibleAssignees(staffDuty, roster, []).map((choice) => choice.id)).not.toContain('p-kim');
		expect(
			eligibleAssignees({ ...staffDuty, exemptPersonnelIds: [] }, roster, []).map((choice) => choice.id)
		).toContain('p-kim');
	});
});

describe('dutySearchScore', () => {
	it('scores every match the same so the prepared order survives, whatever its position in the text', () => {
		expect(dutySearchScore('p-1', 'ab', ['Cabot, Dee', 'SPC'])).toBe(1);
		expect(dutySearchScore('p-2', 'ab', ['Abbott, Cal', 'SPC'])).toBe(1);
		expect(dutySearchScore('p-3', 'ab', ['Young, Dee', 'SPC'])).toBe(0);
	});

	it('matches words in any order across the name and the rank, ignoring case', () => {
		expect(dutySearchScore('p-1', 'lucia  ORTIZ', ['Ortiz, Lucia', 'SPC'])).toBe(1);
		expect(dutySearchScore('p-1', 'spc ortiz', ['Ortiz, Lucia', 'SPC'])).toBe(1);
		expect(dutySearchScore('p-1', 'sgt ortiz', ['Ortiz, Lucia', 'SPC'])).toBe(0);
	});
});

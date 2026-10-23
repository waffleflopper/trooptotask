import { describe, expect, it } from 'vitest';
import type { AssignmentType, AvailabilityEntry } from '$features/calendar/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import { planDutyFill } from './dutyFill';
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

const personnel = [
	person('p-adams', 'Adams'),
	person('p-baker', 'Baker'),
	person('p-cole', 'Cole'),
	person('p-dunn', 'Dunn'),
	person('p-exempt', 'Able')
];

const DATES = ['2026-10-27', '2026-10-28', '2026-10-29'];

function plan(
	overrides: { entries?: AvailabilityEntry[]; picks?: [string, string][]; type?: AssignmentType; groups?: Group[] } = {}
) {
	return planDutyFill({
		type: overrides.type ?? staffDuty,
		dates: DATES,
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
		picks: new Map(overrides.picks ?? [])
	});
}

const choices = (slots: ReturnType<typeof plan>) =>
	slots.map((slot) => [slot.date, slot.choice?.id ?? null, slot.picked]);

describe('planDutyFill', () => {
	it('keeps the viewer pick and suggests someone else wherever that person was suggested', () => {
		expect(choices(plan({ picks: [['2026-10-29', 'p-adams']] }))).toEqual([
			['2026-10-27', 'p-baker', false],
			['2026-10-28', 'p-cole', false],
			['2026-10-29', 'p-adams', true]
		]);
	});

	it('without a roster suggests people available that day in name order, never an excused one', () => {
		expect(choices(plan({ entries: [leave('p-adams', '2026-10-26', '2026-10-27')] }))).toEqual([
			['2026-10-27', 'p-baker', false],
			['2026-10-28', 'p-adams', false],
			['2026-10-29', 'p-cole', false]
		]);
	});

	it('suggests a person whose status that day is Still available', () => {
		const appointment = { ...leave('p-adams', '2026-10-27', '2026-10-27'), statusTypeId: 'appointment' };
		expect(choices(plan({ entries: [appointment] }))).toEqual([
			['2026-10-27', 'p-adams', false],
			['2026-10-28', 'p-baker', false],
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

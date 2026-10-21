import { describe, expect, it } from 'vitest';
import type { AssignmentType, AvailabilityEntry, DailyAssignment } from '$features/calendar/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import { planDutyFill } from './dutyFill';
import { indexDutyAvailability, indexDutyHistory } from './dutyReadModel';

const staffDuty: AssignmentType = {
	id: 'sd',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#b91c1c',
	exemptPersonnelIds: ['p-exempt'],
	showOnCalendar: true,
	sortOrder: 0
};

function person(id: string, lastName: string): Personnel {
	return { id, rank: 'SPC', lastName, firstName: 'A', mos: '', clinicRole: '', groupId: null, groupName: '' };
}

function duty(date: string, assigneeId: string): DailyAssignment {
	return { id: `${assigneeId}-${date}`, date, assignmentTypeId: 'sd', assigneeId };
}

function leave(personnelId: string, startDate: string, endDate: string): AvailabilityEntry {
	return { id: `${personnelId}-${startDate}`, personnelId, statusTypeId: 'leave', startDate, endDate };
}

const roster = [
	person('p-adams', 'Adams'),
	person('p-baker', 'Baker'),
	person('p-cole', 'Cole'),
	person('p-exempt', 'Able')
];

function plan(
	overrides: { entries?: AvailabilityEntry[]; picks?: [string, string][]; type?: AssignmentType; groups?: Group[] } = {}
) {
	return planDutyFill({
		type: overrides.type ?? staffDuty,
		dates: ['2026-10-27', '2026-10-28', '2026-10-29'],
		personnel: roster,
		groups: overrides.groups ?? [],
		availabilityByPerson: indexDutyAvailability(overrides.entries ?? []),
		statusTypes: [{ id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#fff', shortLabel: null, sortOrder: 0 }],
		// Cole last served 60 days before the first day, Baker 30, Adams never: Adams has gone longest.
		history: indexDutyHistory([duty('2026-08-28', 'p-cole'), duty('2026-09-27', 'p-baker')]),
		picks: new Map(overrides.picks ?? [])
	}).map((slot) => [slot.date, slot.choice?.id ?? null, slot.picked]);
}

describe('planDutyFill', () => {
	it('suggests the longest idle person for each day and never the same person twice or an exempt one', () => {
		expect(plan()).toEqual([
			['2026-10-27', 'p-adams', false],
			['2026-10-28', 'p-cole', false],
			['2026-10-29', 'p-baker', false]
		]);
	});

	it('skips a person unavailable that day and suggests them on a day they are back', () => {
		expect(plan({ entries: [leave('p-adams', '2026-10-26', '2026-10-27')] })).toEqual([
			['2026-10-27', 'p-cole', false],
			['2026-10-28', 'p-adams', false],
			['2026-10-29', 'p-baker', false]
		]);
	});

	it('keeps the viewer pick and suggests someone else wherever that person was suggested', () => {
		expect(plan({ picks: [['2026-10-29', 'p-adams']] })).toEqual([
			['2026-10-27', 'p-cole', false],
			['2026-10-28', 'p-baker', false],
			['2026-10-29', 'p-adams', true]
		]);
	});

	it('leaves a day empty when everyone eligible is unavailable or already suggested', () => {
		expect(
			plan({ entries: [leave('p-adams', '2026-10-29', '2026-10-29'), leave('p-cole', '2026-10-29', '2026-10-29')] })
		).toEqual([
			['2026-10-27', 'p-adams', false],
			['2026-10-28', 'p-cole', false],
			['2026-10-29', 'p-baker', false]
		]);
		expect(plan({ entries: [leave('p-baker', '2026-10-29', '2026-10-29')] })).toEqual([
			['2026-10-27', 'p-adams', false],
			['2026-10-28', 'p-cole', false],
			['2026-10-29', null, false]
		]);
	});

	it('suggests each group once, in name order, for a group duty', () => {
		const groups = [
			{ id: 'g-bravo', name: 'Bravo', sortOrder: 1 },
			{ id: 'g-alpha', name: 'Alpha', sortOrder: 0 }
		] as Group[];
		expect(plan({ type: { ...staffDuty, assignTo: 'group' }, groups })).toEqual([
			['2026-10-27', 'g-alpha', false],
			['2026-10-28', 'g-bravo', false],
			['2026-10-29', null, false]
		]);
	});
});

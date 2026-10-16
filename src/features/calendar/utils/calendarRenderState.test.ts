import { describe, expect, it } from 'vitest';
import type { AssignmentType, SpecialDay, DailyAssignment } from '$features/calendar/contracts';
import { buildCalendarDays, buildDutyMarkers } from './calendarRenderState';

const assignmentTypes: AssignmentType[] = [
	{
		id: 'mod',
		name: 'Manager on Duty',
		shortName: 'MOD',
		assignTo: 'personnel',
		color: '#dc2626',
		exemptPersonnelIds: [],
		showOnCalendar: true,
		sortOrder: 0
	}
];

function assignment(overrides: Partial<DailyAssignment>): DailyAssignment {
	return {
		id: 'assignment-1',
		date: '2026-03-01',
		assignmentTypeId: 'mod',
		assigneeId: 'person-1',
		...overrides
	};
}

const dateKeys = ['2026-03-01', '2026-03-02', '2026-03-03'];

describe('buildDutyMarkers', () => {
	it('places each saved person assignment at its person and visible day', () => {
		const markers = buildDutyMarkers(
			[
				assignment({ id: 'manual' }),
				assignment({ id: 'linked', date: '2026-03-02' }),
				assignment({ id: 'edited', date: '2026-03-03', assigneeId: 'person-2' }),
				assignment({ id: 'outside', date: '2026-03-09' }),
				assignment({ id: 'type-gone', date: '2026-03-03', assignmentTypeId: 'deleted-type' })
			],
			assignmentTypes,
			dateKeys
		);
		const mod = { name: 'Manager on Duty', shortName: 'MOD', color: '#dc2626' };

		expect(markers.get('person-1')?.get(0)).toEqual([{ id: 'manual', ...mod }]);
		expect(markers.get('person-1')?.get(1)).toEqual([{ id: 'linked', ...mod }]);
		expect(markers.get('person-1')?.get(2)).toBeUndefined();
		expect(markers.get('person-2')?.get(2)).toEqual([{ id: 'edited', ...mod }]);
		expect(new Set(markers.get('person-1')?.keys())).toEqual(new Set([0, 1]));
	});

	it('does not turn a Group assignment into a marker for a person with the same id', () => {
		const markers = buildDutyMarkers(
			[assignment({ id: 'group', assignmentTypeId: 'group-detail' })],
			[...assignmentTypes, { ...assignmentTypes[0], id: 'group-detail', name: 'Group Detail', assignTo: 'group' }],
			dateKeys
		);

		expect(markers.size).toBe(0);
	});
});

describe('buildCalendarDays', () => {
	it('names each day and marks weekends and the special day saved for a date', () => {
		const special: SpecialDay = { id: 'special-1', date: '2026-03-01', name: 'Training Holiday', type: 'org-closure' };
		const days = new Map(
			buildCalendarDays([new Date(2026, 2, 1), new Date(2026, 2, 2)], [special]).map((day) => [day.dateKey, day])
		);

		expect(days.get('2026-03-01')).toMatchObject({
			dayName: 'Sun',
			dayOfMonth: 1,
			dateLabel: 'Sunday, March 1, 2026',
			weekend: true,
			holiday: true,
			holidayName: 'Training Holiday'
		});
		expect(days.get('2026-03-02')).toMatchObject({
			dayName: 'Mon',
			dayOfMonth: 2,
			dateLabel: 'Monday, March 2, 2026',
			weekend: false,
			holiday: false
		});
	});
});

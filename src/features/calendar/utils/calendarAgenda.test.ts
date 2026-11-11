import { describe, expect, it } from 'vitest';
import type {
	AssignmentType,
	AvailabilityEntry,
	DailyAssignment,
	SpecialDay,
	StatusType
} from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import { weekDates } from './calendarRange';
import { buildAvailabilityTracks } from './availabilityTracks';
import { assignmentSlotKey } from './calendarIndexes';
import { buildCalendarAgenda, rosterPeople } from './calendarAgenda';

function person(id: string, lastName: string): Personnel {
	return { id, firstName: 'Pat', lastName, rank: 'SGT', mos: '11B', clinicRole: '', groupId: 'g1', groupName: 'Alpha' };
}

function status(id: string, name: string): StatusType {
	return {
		id,
		name,
		color: '#16a34a',
		textColor: '#ffffff',
		shortLabel: null,
		rosterEffect: 'A',
		sortOrder: 0,
		archivedAt: null
	};
}

function entry(id: string, personnelId: string, statusTypeId: string, startDate: string, endDate: string) {
	return { id, personnelId, statusTypeId, startDate, endDate, note: null } satisfies AvailabilityEntry;
}

function dutyType(id: string, assignTo: AssignmentType['assignTo']): AssignmentType {
	return {
		id,
		name: id.toUpperCase(),
		shortName: id.toUpperCase(),
		assignTo,
		color: '#2563eb',
		poolRules: null,
		weekendMode: 'same',
		excusals: [],
		showOnCalendar: true,
		sortOrder: 0
	};
}

const alice = person('p1', 'Adams');
const bob = person('p2', 'Brown');
const cara = person('p3', 'Cole');
const statusTypes = [status('leave', 'Leave'), status('sick', 'Sick'), status('tdy', 'TDY')];
const entries = [
	entry('e-leave', 'p1', 'leave', '2026-11-10', '2026-11-12'),
	entry('e-sick', 'p1', 'sick', '2026-11-11', '2026-11-11'),
	entry('e-tdy', 'p2', 'tdy', '2026-11-14', '2026-11-20'),
	entry('e-outside', 'p4', 'leave', '2026-11-09', '2026-11-15')
];
const types = [dutyType('sd', 'personnel'), dutyType('cq', 'group')];
const assignments: DailyAssignment[] = [
	{ id: 'a-cara', date: '2026-11-10', assignmentTypeId: 'sd', assigneeId: 'p3' },
	{ id: 'a-alice', date: '2026-11-11', assignmentTypeId: 'sd', assigneeId: 'p1' },
	{ id: 'a-group', date: '2026-11-12', assignmentTypeId: 'cq', assigneeId: 'g1' },
	{ id: 'a-next-week', date: '2026-11-16', assignmentTypeId: 'sd', assigneeId: 'p2' }
];
const specialDays: SpecialDay[] = [{ id: 'sp1', date: '2026-11-11', name: 'Veterans Day', type: 'federal-holiday' }];
const conflict = 'Leave 10–12 Nov; Sick 11 Nov';

function agenda() {
	return buildCalendarAgenda({
		dates: weekDates(new Date(2026, 10, 11)),
		people: [alice, bob, cara],
		tracks: buildAvailabilityTracks(entries, statusTypes),
		specialDays,
		assignments,
		assignmentTypes: types,
		unavailable: new Map([[assignmentSlotKey('2026-11-11', 'sd'), conflict]])
	});
}

describe('buildCalendarAgenda', () => {
	it('lists the seven days of the week, naming a Special Day', () => {
		const days = agenda();

		expect(days.map((day) => day.dateKey)).toEqual([
			'2026-11-09',
			'2026-11-10',
			'2026-11-11',
			'2026-11-12',
			'2026-11-13',
			'2026-11-14',
			'2026-11-15'
		]);
		expect(days.map((day) => day.specialDay?.name)).toEqual([
			undefined,
			undefined,
			'Veterans Day',
			undefined,
			undefined,
			undefined,
			undefined
		]);
	});

	it('counts who is available from the people it was given, never someone outside them', () => {
		expect(agenda().map((day) => [day.available, day.total])).toEqual([
			[3, 3],
			[2, 3],
			[2, 3],
			[2, 3],
			[3, 3],
			[2, 3],
			[2, 3]
		]);
	});

	it('lists only people who are out or on duty, with each day’s statuses and duties together', () => {
		const people = (index: number) =>
			agenda()[index].people.map((entry) => ({
				person: entry.person.id,
				statuses: entry.statuses.map((span) => span.entry.id),
				duties: entry.duties.map((duty) => duty.assignment.id)
			}));

		expect(people(0)).toEqual([]);
		expect(people(1)).toEqual([
			{ person: 'p1', statuses: ['e-leave'], duties: [] },
			{ person: 'p3', statuses: [], duties: ['a-cara'] }
		]);
		expect(people(2)).toEqual([{ person: 'p1', statuses: ['e-leave', 'e-sick'], duties: ['a-alice'] }]);
		expect(people(5)).toEqual([{ person: 'p2', statuses: ['e-tdy'], duties: [] }]);
	});

	it('carries the grid’s conflict reason on a duty whose person is unavailable and on no other', () => {
		const days = agenda();

		expect(days[2].people[0].duties[0].conflict).toBe(conflict);
		expect(days[1].people[1].duties[0].conflict).toBeUndefined();
	});

	it('draws no row for a Group-assigned duty or a duty on another week', () => {
		const dutyIds = agenda().flatMap((day) =>
			day.people.flatMap((entry) => entry.duties.map((duty) => duty.assignment.id))
		);

		expect(dutyIds).toEqual(['a-cara', 'a-alice']);
	});
});

describe('rosterPeople', () => {
	it('lists each person once, in band order', () => {
		expect(
			rosterPeople([{ personnel: [alice, bob] }, { personnel: [cara, alice] }]).map((member) => member.id)
		).toEqual(['p1', 'p2', 'p3']);
	});
});

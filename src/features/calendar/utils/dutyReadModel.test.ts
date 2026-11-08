import { describe, expect, it } from 'vitest';
import type { AssignmentType, AvailabilityEntry, DailyAssignment } from '$features/calendar/contracts';
import { assignmentSlotKey } from './calendarIndexes';
import type { StatusType } from '$features/calendar/contracts';
import {
	blockingAvailability,
	coveringLabel,
	dutyConflictReasons,
	findDutyConflicts,
	indexDutyAvailability
} from './dutyReadModel';

function duty(id: string, date: string, assigneeId: string, assignmentTypeId = 'cq'): DailyAssignment {
	return { id, date, assignmentTypeId, assigneeId };
}

function entry(id: string, personnelId: string, startDate: string, endDate: string): AvailabilityEntry {
	return { id, personnelId, statusTypeId: 'leave', startDate, endDate };
}

function type(id: string, overrides: Partial<AssignmentType> = {}): AssignmentType {
	return {
		id,
		name: id,
		shortName: id,
		assignTo: 'personnel',
		color: '#000',
		poolRules: null,
		weekendMode: 'same',
		excusals: [],
		showOnCalendar: true,
		sortOrder: 0,
		...overrides
	};
}

describe('findDutyConflicts', () => {
	const october = { rangeStart: '2026-10-01', rangeEnd: '2026-10-31' };
	const types = [type('cq'), type('sd'), type('gg', { assignTo: 'group' }), type('old', { archivedAt: '2026-01-01' })];

	function conflicts(assignments: DailyAssignment[], entries: AvailabilityEntry[]) {
		return findDutyConflicts({
			assignments,
			assignmentTypes: types,
			availabilityByPerson: indexDutyAvailability(entries),
			range: october
		});
	}

	it('flags an assignment on the first and last day of an availability entry but not the day outside it', () => {
		const result = conflicts(
			[
				duty('start', '2026-10-20', 'p'),
				duty('end', '2026-10-23', 'p', 'sd'),
				duty('before', '2026-10-19', 'p'),
				duty('after', '2026-10-24', 'p')
			],
			[entry('leave-1', 'p', '2026-10-20', '2026-10-23')]
		);

		expect(result.items.map((conflict) => conflict.assignment.id)).toEqual(['start', 'end']);
		expect(result.bySlot.get(assignmentSlotKey('2026-10-20', 'cq'))?.assignment.id).toBe('start');
		expect(result.bySlot.get(assignmentSlotKey('2026-10-23', 'sd'))?.assignment.id).toBe('end');
		expect(result.bySlot.size).toBe(2);
	});

	it('lists every covering entry and skips Groups, archived types, other months and other people', () => {
		const result = conflicts(
			[
				duty('person', '2026-10-21', 'p'),
				duty('group', '2026-10-21', 'p', 'gg'),
				duty('archived', '2026-10-21', 'p', 'old'),
				duty('november', '2026-11-01', 'p'),
				duty('september', '2026-09-30', 'p'),
				duty('someone-else', '2026-10-21', 'q')
			],
			[entry('leave-1', 'p', '2026-10-20', '2026-10-23'), entry('tdy-1', 'p', '2026-10-21', '2026-11-05')]
		);

		expect(result.items.map((conflict) => conflict.assignment.id)).toEqual(['person']);
		expect(result.items[0].entries.map((covering) => covering.id)).toEqual(['leave-1', 'tdy-1']);
		expect(result.bySlot.get(assignmentSlotKey('2026-10-21', 'cq'))?.assignment.id).toBe('person');
	});

	it('orders by date, then by the order of the assignment types, and keeps an exempt person visible', () => {
		const result = findDutyConflicts({
			assignments: [
				duty('b', '2026-10-05', 'p', 'sd'),
				duty('c', '2026-10-05', 'p', 'cq'),
				duty('a', '2026-10-02', 'p')
			],
			assignmentTypes: [
				type('sd', { excusals: [{ personId: 'p', reason: 'Excused', startsOn: '2026-01-01' }] }),
				type('cq')
			],
			availabilityByPerson: indexDutyAvailability([entry('leave-1', 'p', '2026-10-01', '2026-10-31')]),
			range: october
		});

		expect(result.items.map((conflict) => conflict.assignment.id)).toEqual(['a', 'b', 'c']);
	});
});

describe('blocking availability', () => {
	const statuses: StatusType[] = [
		{ id: 'leave', name: 'Leave', rosterEffect: 'A' },
		{ id: 'present', name: 'Present', rosterEffect: 'available' }
	] as StatusType[];
	const entries: AvailabilityEntry[] = [
		{ id: 'a', personnelId: 'p', statusTypeId: 'leave', startDate: '2026-10-20', endDate: '2026-10-23' },
		{ id: 'b', personnelId: 'p', statusTypeId: 'present', startDate: '2026-10-20', endDate: '2026-10-23' },
		{ id: 'c', personnelId: 'p', statusTypeId: 'gone', startDate: '2026-10-25', endDate: '2026-10-25' }
	];

	it('drops entries whose status leaves the person available and keeps unknown statuses', () => {
		expect(blockingAvailability(entries, statuses).map((entry) => entry.id)).toEqual(['a', 'c']);
	});

	it('labels every covering entry, naming an unknown status Unavailable, and nothing off the covered days', () => {
		const names = new Map([['leave', 'Leave']]);
		expect(coveringLabel(entries, '2026-10-21', names, new Set(['present']))).toBe('Leave 20–23 Oct');
		expect(coveringLabel(entries, '2026-10-25', names)).toBe('Unavailable 25 Oct');
		expect(coveringLabel(entries, '2026-10-24', names)).toBeUndefined();
		expect(coveringLabel(undefined, '2026-10-24', names)).toBeUndefined();
	});

	it('explains each conflicted slot with its covering entries joined by a semicolon', () => {
		const result = findDutyConflicts({
			assignments: [duty('d1', '2026-10-21', 'p')],
			assignmentTypes: [type('cq')],
			availabilityByPerson: indexDutyAvailability([
				entry('l1', 'p', '2026-10-20', '2026-10-23'),
				{ ...entry('l2', 'p', '2026-10-21', '2026-10-21'), statusTypeId: 'gone' }
			]),
			range: { rangeStart: '2026-10-01', rangeEnd: '2026-10-31' }
		});

		expect([...dutyConflictReasons(result, statuses)]).toEqual([
			['2026-10-21::cq', 'Leave 20–23 Oct; Unavailable 21 Oct']
		]);
	});
});

import { afterEach, describe, expect, it } from 'vitest';
import type { AssignmentType, AvailabilityEntry, DailyAssignment } from '$features/calendar/contracts';
import { assignmentSlotKey } from './calendarIndexes';
import { findDutyConflicts, indexDutyAvailability, indexDutyHistory, lastDutyBefore } from './dutyReadModel';

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
		exemptPersonnelIds: [],
		showOnCalendar: true,
		sortOrder: 0,
		...overrides
	};
}

function lastDuty(assignments: DailyAssignment[], personnelId: string, dateKey: string, assignmentTypeId = 'cq') {
	return lastDutyBefore({ history: indexDutyHistory(assignments), assignmentTypeId, personnelId, dateKey });
}

describe('lastDutyBefore', () => {
	it('counts a duty exactly 90 days earlier and ignores one 91 days earlier', () => {
		const assignments = [duty('a', '2026-07-29', 'edge'), duty('b', '2026-07-28', 'beyond')];

		expect(lastDuty(assignments, 'edge', '2026-10-27')).toEqual({
			kind: 'previous',
			date: '2026-07-29',
			daysSince: 90
		});
		expect(lastDuty(assignments, 'beyond', '2026-10-27')).toEqual({ kind: 'none' });
	});

	it('ignores duties on or after the slot date, so a later date in the month cannot change an earlier slot', () => {
		const assignments = [duty('a', '2026-10-20', 'p'), duty('b', '2026-10-27', 'p'), duty('c', '2026-10-30', 'p')];

		expect(lastDuty(assignments, 'p', '2026-10-27')).toEqual({ kind: 'previous', date: '2026-10-20', daysSince: 7 });
		expect(lastDuty(assignments, 'p', '2026-10-20')).toEqual({ kind: 'none' });
		expect(lastDuty(assignments, 'p', '2026-10-31')).toEqual({ kind: 'previous', date: '2026-10-30', daysSince: 1 });
	});

	it('takes the latest earlier duty and keeps each assignment type separate', () => {
		const assignments = [
			duty('a', '2026-08-01', 'p'),
			duty('b', '2026-10-20', 'p'),
			duty('c', '2026-10-25', 'p', 'staff-duty')
		];

		expect(lastDuty(assignments, 'p', '2026-10-27')).toEqual({ kind: 'previous', date: '2026-10-20', daysSince: 7 });
		expect(lastDuty(assignments, 'p', '2026-10-27', 'staff-duty')).toEqual({
			kind: 'previous',
			date: '2026-10-25',
			daysSince: 2
		});
	});

	describe('across a daylight-saving change', () => {
		const originalTimezone = process.env.TZ;
		afterEach(() => {
			if (originalTimezone === undefined) delete process.env.TZ;
			else process.env.TZ = originalTimezone;
		});

		it.each([
			['spring', '2026-03-07', '2026-03-10', 3],
			['autumn', '2026-10-31', '2026-11-03', 3]
		])('counts civil days across the %s clock change', (_season, dutyDate, dateKey, daysSince) => {
			process.env.TZ = 'America/Los_Angeles';

			expect(lastDuty([duty('a', dutyDate, 'p')], 'p', dateKey)).toEqual({
				kind: 'previous',
				date: dutyDate,
				daysSince
			});
		});
	});
});

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
			assignmentTypes: [type('sd', { exemptPersonnelIds: ['p'] }), type('cq')],
			availabilityByPerson: indexDutyAvailability([entry('leave-1', 'p', '2026-10-01', '2026-10-31')]),
			range: october
		});

		expect(result.items.map((conflict) => conflict.assignment.id)).toEqual(['a', 'b', 'c']);
	});
});

import { describe, expect, it } from 'vitest';
import { indexAssignmentsBySlot, openAssignmentDates } from './calendarIndexes';

describe('openAssignmentDates', () => {
	it('returns the dates with no assignment of that type, counting weekends and other types as open', () => {
		const slots = indexAssignmentsBySlot([
			{ id: 'a', date: '2026-10-23', assignmentTypeId: 'sd', assigneeId: 'pike' },
			{ id: 'b', date: '2026-10-24', assignmentTypeId: 'cq', assigneeId: 'diaz' },
			{ id: 'c', date: '2026-10-26', assignmentTypeId: 'sd', assigneeId: 'reyes' }
		]);

		expect(openAssignmentDates(slots, 'sd', ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'])).toEqual([
			'2026-10-24',
			'2026-10-25'
		]);
	});
});

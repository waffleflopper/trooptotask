import { describe, expect, it } from 'vitest';
import { shownEntryByPerson, sortedStatusTypes } from './dayStatuses';

const LEAVE = { id: 'leave', name: 'Leave', sortOrder: 1 };
const TDY = { id: 'tdy', name: 'TDY', sortOrder: 0 };
const SICK = { id: 'sick', name: 'Appointment', sortOrder: 1 };

describe('sortedStatusTypes', () => {
	it('orders by sort order, then name', () => {
		expect(sortedStatusTypes([LEAVE, TDY, SICK]).map((type) => type.id)).toEqual(['tdy', 'sick', 'leave']);
	});
});

describe('shownEntryByPerson', () => {
	it('shows the first-ranked status, then the earlier start, then the lower id', () => {
		const shown = shownEntryByPerson(
			[
				{ id: 'e1', personnelId: 'a', statusTypeId: 'leave', startDate: '2026-10-01' },
				{ id: 'e2', personnelId: 'a', statusTypeId: 'tdy', startDate: '2026-10-20' },
				{ id: 'e4', personnelId: 'b', statusTypeId: 'leave', startDate: '2026-10-20' },
				{ id: 'e3', personnelId: 'b', statusTypeId: 'leave', startDate: '2026-10-20' },
				{ id: 'e5', personnelId: 'b', statusTypeId: 'leave', startDate: '2026-10-21' },
				{ id: 'e6', personnelId: 'c', statusTypeId: 'unknown', startDate: '2026-10-01' },
				{ id: 'e7', personnelId: 'c', statusTypeId: 'leave', startDate: '2026-10-22' }
			],
			[LEAVE, TDY]
		);
		expect([...shown].map(([person, entry]) => [person, entry.id])).toEqual([
			['a', 'e2'],
			['b', 'e3'],
			['c', 'e7']
		]);
	});
});

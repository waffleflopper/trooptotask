import { describe, expect, it } from 'vitest';
import type { AvailabilityEntry, StatusType } from '$lib/types';
import { buildAvailabilityStatusIndex } from './calendarIndexes';

const statusTypes: StatusType[] = [
	{ id: 'leave', name: 'Leave', color: '#2563eb', textColor: '#ffffff' },
	{ id: 'school', name: 'School', color: '#16a34a', textColor: '#ffffff' }
];

function availability(overrides: Partial<AvailabilityEntry>): AvailabilityEntry {
	return {
		id: 'availability-1',
		personnelId: 'person-1',
		statusTypeId: 'leave',
		startDate: '2026-03-01',
		endDate: '2026-03-01',
		note: null,
		...overrides
	};
}

describe('calendarIndexes', () => {
	it('indexes availability statuses by visible person and date only', () => {
		const index = buildAvailabilityStatusIndex({
			availabilityEntries: [
				availability({ startDate: '2026-02-28', endDate: '2026-03-02' }),
				availability({
					id: 'availability-2',
					personnelId: 'person-2',
					statusTypeId: 'school',
					startDate: '2026-03-03',
					endDate: '2026-03-04'
				}),
				availability({
					id: 'availability-3',
					personnelId: 'person-3',
					statusTypeId: 'missing-status',
					startDate: '2026-03-01',
					endDate: '2026-03-01'
				})
			],
			statusTypes,
			dateKeys: ['2026-03-01', '2026-03-02', '2026-03-03']
		});

		expect(index.getStatus('person-1', '2026-03-01')?.name).toBe('Leave');
		expect(index.getStatus('person-1', '2026-03-02')?.name).toBe('Leave');
		expect(index.getStatus('person-1', '2026-03-03')).toBeUndefined();
		expect(index.getStatus('person-2', '2026-03-03')?.name).toBe('School');
		expect(index.getStatus('person-2', '2026-03-04')).toBeUndefined();
		expect(index.getStatus('person-3', '2026-03-01')).toBeUndefined();
	});
});

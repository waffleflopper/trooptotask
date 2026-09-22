import { describe, expect, it } from 'vitest';
import type { AvailabilityEntry, Personnel, StatusType } from '$lib/types';
import { computeAvailabilityForecast, computeGroupReadiness } from './calendarReports';

function person(overrides: Partial<Personnel>): Personnel {
	return {
		id: overrides.id ?? 'person-1',
		rank: overrides.rank ?? 'SGT',
		lastName: overrides.lastName ?? 'Smith',
		firstName: overrides.firstName ?? 'Sam',
		mos: '11B',
		clinicRole: 'Duty Role',
		groupId: overrides.groupId ?? 'group-a',
		groupName: overrides.groupName ?? 'Alpha',
		...overrides
	};
}

function availability(overrides: Partial<AvailabilityEntry>): AvailabilityEntry {
	return {
		id: overrides.id ?? 'availability-1',
		personnelId: overrides.personnelId ?? 'person-1',
		statusTypeId: overrides.statusTypeId ?? 'leave',
		startDate: overrides.startDate ?? '2026-03-01',
		endDate: overrides.endDate ?? '2026-03-01',
		note: null,
		...overrides
	};
}

const statusTypes: StatusType[] = [
	{ id: 'leave', name: 'Leave', color: '#2563eb', textColor: '#ffffff' },
	{ id: 'school', name: 'School', color: '#16a34a', textColor: '#ffffff' }
];

describe('computeAvailabilityForecast', () => {
	it('preserves overlapping-entry first-match details across a long date range', () => {
		const personnel = [
			person({ id: 'person-1', lastName: 'Able' }),
			person({ id: 'person-2', lastName: 'Baker' }),
			person({ id: 'person-3', lastName: 'Clark' })
		];
		const result = computeAvailabilityForecast(
			personnel,
			[
				availability({
					id: 'leave-1',
					personnelId: 'person-1',
					statusTypeId: 'leave',
					startDate: '2026-03-01',
					endDate: '2026-03-20'
				}),
				availability({
					id: 'school-1',
					personnelId: 'person-1',
					statusTypeId: 'school',
					startDate: '2026-03-10',
					endDate: '2026-03-12'
				}),
				availability({
					id: 'school-2',
					personnelId: 'person-2',
					statusTypeId: 'school',
					startDate: '2026-03-15',
					endDate: '2026-03-15'
				})
			],
			statusTypes,
			'2026-03-01',
			'2026-04-29'
		);

		expect(result.days).toHaveLength(60);
		expect(result.days.find((day) => day.date === '2026-03-10')?.unavailablePersonnel).toEqual([
			{ person: personnel[0], statusName: 'Leave', statusColor: '#2563eb' }
		]);
		expect(result.days.find((day) => day.date === '2026-03-15')).toMatchObject({
			unavailableCount: 2,
			availableCount: 1,
			availablePercent: 33
		});
		expect(result.days.find((day) => day.date === '2026-04-29')).toMatchObject({
			unavailableCount: 0,
			availableCount: 3,
			availablePercent: 100
		});
	});

	it('handles empty personnel and empty entries without special-case scans', () => {
		const result = computeAvailabilityForecast([], [], statusTypes, '2026-03-01', '2026-03-03');

		expect(result.days).toEqual([
			{
				date: '2026-03-01',
				totalPersonnel: 0,
				unavailableCount: 0,
				availableCount: 0,
				availablePercent: 100,
				unavailablePersonnel: []
			},
			{
				date: '2026-03-02',
				totalPersonnel: 0,
				unavailableCount: 0,
				availableCount: 0,
				availablePercent: 100,
				unavailablePersonnel: []
			},
			{
				date: '2026-03-03',
				totalPersonnel: 0,
				unavailableCount: 0,
				availableCount: 0,
				availablePercent: 100,
				unavailablePersonnel: []
			}
		]);
	});
});

describe('computeGroupReadiness', () => {
	it('preserves selected-group readiness and ignores unselected or ungrouped personnel', () => {
		const personnel = [
			person({ id: 'alpha-1', groupId: 'group-a', groupName: 'Alpha' }),
			person({ id: 'alpha-2', groupId: 'group-a', groupName: 'Alpha' }),
			person({ id: 'bravo-1', groupId: 'group-b', groupName: 'Bravo' }),
			person({ id: 'ungrouped', groupId: null, groupName: '' })
		];
		const result = computeGroupReadiness(
			personnel,
			[
				availability({ id: 'alpha-leave', personnelId: 'alpha-1', startDate: '2026-03-01', endDate: '2026-03-03' }),
				availability({
					id: 'alpha-long-range',
					personnelId: 'alpha-2',
					startDate: '2026-04-29',
					endDate: '2026-04-29'
				}),
				availability({ id: 'bravo-leave', personnelId: 'bravo-1', startDate: '2026-03-02', endDate: '2026-03-02' }),
				availability({
					id: 'ungrouped-leave',
					personnelId: 'ungrouped',
					startDate: '2026-03-01',
					endDate: '2026-03-03'
				})
			],
			[
				{ id: 'group-a', name: 'Alpha' },
				{ id: 'group-b', name: 'Bravo' },
				{ id: 'group-empty', name: 'Empty' }
			],
			new Set(['group-a', 'group-empty']),
			'2026-03-01',
			'2026-04-29'
		);

		expect(result.dates).toHaveLength(60);
		expect(result.dates.slice(0, 3)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
		expect(result.groups.map((group) => group.groupId)).toEqual(['group-a', 'group-empty']);
		expect(result.groups[0].cells.slice(0, 3)).toEqual([
			{ date: '2026-03-01', totalPersonnel: 2, availableCount: 1, availablePercent: 50 },
			{ date: '2026-03-02', totalPersonnel: 2, availableCount: 1, availablePercent: 50 },
			{ date: '2026-03-03', totalPersonnel: 2, availableCount: 1, availablePercent: 50 }
		]);
		expect(result.groups[0].cells.at(-1)).toEqual({
			date: '2026-04-29',
			totalPersonnel: 2,
			availableCount: 1,
			availablePercent: 50
		});
		expect(result.groups[1].cells.slice(0, 3)).toEqual([
			{ date: '2026-03-01', totalPersonnel: 0, availableCount: 0, availablePercent: 100 },
			{ date: '2026-03-02', totalPersonnel: 0, availableCount: 0, availablePercent: 100 },
			{ date: '2026-03-03', totalPersonnel: 0, availableCount: 0, availablePercent: 100 }
		]);
		expect(result.groups[1].cells.at(-1)).toEqual({
			date: '2026-04-29',
			totalPersonnel: 0,
			availableCount: 0,
			availablePercent: 100
		});
	});
});

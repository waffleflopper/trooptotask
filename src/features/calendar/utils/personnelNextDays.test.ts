import { describe, expect, it } from 'vitest';
import type { PersonnelCalendarWindow } from '../calendar.types';
import { buildPersonnelNextDays } from './personnelNextDays';

const leave = { id: 'leave', name: 'Leave', color: '#f59e0b', textColor: '#000000', shortLabel: 'L', sortOrder: 0 };
const range = { id: 'range', name: 'Range', color: '#2563eb', textColor: '#ffffff', shortLabel: null, sortOrder: 1 };
const cq = {
	id: 'cq',
	name: 'Charge of Quarters',
	shortName: 'CQ',
	assignTo: 'personnel' as const,
	color: '#57534d',
	exemptPersonnelIds: [],
	showOnCalendar: true,
	sortOrder: 0
};

function window(overrides: Partial<PersonnelCalendarWindow> = {}): PersonnelCalendarWindow {
	return {
		rangeStart: '2026-10-06',
		rangeEnd: '2026-10-19',
		availability: [],
		statusTypes: [leave, range],
		assignments: [],
		assignmentTypes: [cq],
		specialDays: [],
		...overrides
	};
}

describe('buildPersonnelNextDays', () => {
	it('names every entry the strip draws in day order', () => {
		const days = buildPersonnelNextDays(
			window({
				availability: [
					{
						id: 'a1',
						personnelId: 'p1',
						statusTypeId: 'leave',
						startDate: '2026-10-16',
						endDate: '2026-10-19',
						note: 'Ordinary'
					},
					{
						id: 'a2',
						personnelId: 'p1',
						statusTypeId: 'range',
						startDate: '2026-10-14',
						endDate: '2026-10-14',
						note: 'M4 qualification'
					}
				],
				assignments: [{ id: 'd1', date: '2026-10-08', assignmentTypeId: 'cq', assigneeId: 'p1' }],
				specialDays: [{ id: 's1', date: '2026-10-09', name: 'Training holiday', type: 'org-closure' }]
			})
		);

		expect(days.legend).toEqual([
			{ key: 'd1', name: 'CQ', detail: 'Thu 8 Oct' },
			{ key: 's1', name: 'DONSA', detail: 'Fri 9 Oct · Training holiday' },
			{ key: 'a2', name: 'Range', detail: 'Wed 14 Oct · M4 qualification' },
			{ key: 'a1', name: 'Leave', detail: 'Fri 16 – Mon 19 Oct · Ordinary' }
		]);
		expect(days.layout.bars.map((bar) => [bar.entry.id, bar.start, bar.end, bar.lane])).toEqual([
			['d1', 2, 2, 'full'],
			['a2', 8, 8, 'full'],
			['a1', 10, 13, 'full']
		]);
	});

	it('marks today, weekends and closures on the day columns', () => {
		const days = buildPersonnelNextDays(
			window({ specialDays: [{ id: 's1', date: '2026-10-12', name: 'Columbus Day', type: 'federal-holiday' }] })
		);

		expect(days.columns).toHaveLength(14);
		expect(days.columns[0]).toEqual({
			key: '2026-10-06',
			weekday: 'Tue',
			date: 6,
			today: true,
			weekend: false,
			closure: null
		});
		expect(days.columns.filter((day) => day.weekend).map((day) => day.key)).toEqual([
			'2026-10-10',
			'2026-10-11',
			'2026-10-17',
			'2026-10-18'
		]);
		expect(days.columns[6].closure).toBe('Holiday');
	});

	it('keeps an entry that began before the window whole in the legend and continued on the strip', () => {
		const days = buildPersonnelNextDays(
			window({
				availability: [
					{
						id: 'a1',
						personnelId: 'p1',
						statusTypeId: 'leave',
						startDate: '2026-10-01',
						endDate: '2026-10-07'
					}
				]
			})
		);

		expect(days.legend).toEqual([{ key: 'a1', name: 'Leave', detail: 'Thu 1 – Wed 7 Oct' }]);
		expect(days.layout.bars[0]).toMatchObject({ start: 0, end: 1, continuesBefore: true, continuesAfter: false });
	});

	it('shares the day between an assignment and a status entry', () => {
		const days = buildPersonnelNextDays(
			window({
				availability: [
					{
						id: 'a1',
						personnelId: 'p1',
						statusTypeId: 'range',
						startDate: '2026-10-08',
						endDate: '2026-10-08'
					}
				],
				assignments: [{ id: 'd1', date: '2026-10-08', assignmentTypeId: 'cq', assigneeId: 'g1' }]
			})
		);

		expect(days.layout.bars.map((bar) => bar.lane).sort()).toEqual(['bottom', 'top']);
	});
});

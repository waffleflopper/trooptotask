import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarRangeData } from '$features/calendar/calendar.types';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { beginCalendarRangeRead, loadCalendarRange, mergeCalendarRangeIntoStores } from './calendarRangeLoader';

const cq = {
	id: 'at1',
	name: 'CQ',
	shortName: 'CQ',
	assignTo: 'personnel' as const,
	color: '#ef4444',
	exemptPersonnelIds: [],
	showOnCalendar: false,
	sortOrder: 0
};

function applyRange(data: CalendarRangeData) {
	const read = beginCalendarRangeRead();
	mergeCalendarRangeIntoStores('org-1', data, read);
	read.close();
}

describe('calendarRangeLoader', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		availabilityStore.load(
			[
				{ id: 'a1', personnelId: 'p1', statusTypeId: 'st1', startDate: '2026-03-01', endDate: '2026-03-05', note: null }
			],
			'org-1'
		);
		specialDaysStore.load([{ id: 'sd1', name: 'Existing', date: '2026-03-01', type: 'org-closure' }], 'org-1');
		dailyAssignmentsStore.load(
			[cq],
			[{ id: 'da1', date: '2026-03-01', assignmentTypeId: 'at1', assigneeId: 'p1' }],
			'org-1'
		);
	});

	it('fetches the requested calendar range from the dedicated range endpoint', async () => {
		const payload: CalendarRangeData = {
			rangeStart: '2026-03-01',
			rangeEnd: '2026-06-30',
			availabilityEntries: [],
			specialDays: [],
			dailyAssignments: []
		};
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => payload
		});

		await expect(
			loadCalendarRange('org-1', {
				rangeStart: '2026-03-01',
				rangeEnd: '2026-06-30',
				collections: ['availability', 'assignments']
			})
		).resolves.toEqual(payload);
		expect(fetchMock).toHaveBeenCalledWith(
			'/org/org-1/api/calendar-range?rangeStart=2026-03-01&rangeEnd=2026-06-30&collections=availability%2Cassignments'
		);
	});

	it('treats an empty authoritative range as removal of previously loaded rows', () => {
		applyRange({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-03-31',
			availabilityEntries: [],
			specialDays: [],
			dailyAssignments: []
		});
		expect(availabilityStore.items).toEqual([]);
		expect(specialDaysStore.items).toEqual([]);
		expect(dailyAssignmentsStore.assignments).toEqual([]);
	});

	it('replaces stale in-range calendar data while keeping existing out-of-range store state', () => {
		availabilityStore.load(
			[
				{
					id: 'stale-availability-in-range',
					personnelId: 'p1',
					statusTypeId: 'st1',
					startDate: '2026-03-15',
					endDate: '2026-03-16',
					note: null
				},
				{
					id: 'kept-availability-out-of-range',
					personnelId: 'p1',
					statusTypeId: 'st1',
					startDate: '2026-02-15',
					endDate: '2026-02-16',
					note: null
				},
				{
					id: 'a1',
					personnelId: 'p1',
					statusTypeId: 'st1',
					startDate: '2026-03-01',
					endDate: '2026-03-05',
					note: null
				}
			],
			'org-1'
		);
		specialDaysStore.load(
			[
				{ id: 'stale-special-day-in-range', name: 'Stale', date: '2026-03-15', type: 'org-closure' },
				{ id: 'kept-special-day-out-of-range', name: 'Retained', date: '2026-02-15', type: 'org-closure' }
			],
			'org-1'
		);
		dailyAssignmentsStore.load(
			[cq],
			[
				{ id: 'stale-in-range', date: '2026-03-15', assignmentTypeId: 'at1', assigneeId: 'p1' },
				{ id: 'kept-out-of-range', date: '2026-02-15', assignmentTypeId: 'at1', assigneeId: 'p1' }
			],
			'org-1'
		);

		applyRange({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-06-30',
			availabilityEntries: [
				{
					id: 'a1',
					personnelId: 'p1',
					statusTypeId: 'st2',
					startDate: '2026-03-02',
					endDate: '2026-03-06',
					note: null
				},
				{ id: 'a2', personnelId: 'p2', statusTypeId: 'st1', startDate: '2026-06-01', endDate: '2026-06-02', note: null }
			],
			specialDays: [{ id: 'sd2', name: 'Incoming', date: '2026-06-01', type: 'org-closure' }],
			dailyAssignments: [{ id: 'da2', date: '2026-06-10', assignmentTypeId: 'at1', assigneeId: 'p2' }]
		});

		expect(availabilityStore.orgId).toBe('org-1');
		expect(availabilityStore.items).toEqual([
			{
				id: 'kept-availability-out-of-range',
				personnelId: 'p1',
				statusTypeId: 'st1',
				startDate: '2026-02-15',
				endDate: '2026-02-16',
				note: null
			},
			{
				id: 'a1',
				personnelId: 'p1',
				statusTypeId: 'st2',
				startDate: '2026-03-02',
				endDate: '2026-03-06',
				note: null
			},
			{ id: 'a2', personnelId: 'p2', statusTypeId: 'st1', startDate: '2026-06-01', endDate: '2026-06-02', note: null }
		]);
		expect(specialDaysStore.orgId).toBe('org-1');
		expect(specialDaysStore.items).toEqual([
			{ id: 'kept-special-day-out-of-range', name: 'Retained', date: '2026-02-15', type: 'org-closure' },
			{ id: 'sd2', name: 'Incoming', date: '2026-06-01', type: 'org-closure' }
		]);
		expect(dailyAssignmentsStore.orgId).toBe('org-1');
		expect(dailyAssignmentsStore.assignments).toEqual([
			{ id: 'kept-out-of-range', date: '2026-02-15', assignmentTypeId: 'at1', assigneeId: 'p1' },
			{ id: 'da2', date: '2026-06-10', assignmentTypeId: 'at1', assigneeId: 'p2' }
		]);
		expect(dailyAssignmentsStore.types).toEqual([cq]);
	});
});

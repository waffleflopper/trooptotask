import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarRangeData } from '$lib/server/core/useCases/calendarQuery';

const { availabilityStoreMock, specialDaysStoreMock, dailyAssignmentsStoreMock, fetchMock } = vi.hoisted(() => {
	const availabilityStoreMock = {
		orgId: 'org-1',
		items: [
			{ id: 'a1', personnelId: 'p1', statusTypeId: 'st1', startDate: '2026-03-01', endDate: '2026-03-05', note: null }
		],
		load: vi.fn()
	};
	availabilityStoreMock.load.mockImplementation((items: typeof availabilityStoreMock.items, orgId: string) => {
		availabilityStoreMock.items = items;
		availabilityStoreMock.orgId = orgId;
	});
	const specialDaysStoreMock = {
		orgId: 'org-1',
		items: [{ id: 'sd1', name: 'Existing', date: '2026-03-01', type: 'org-closure' }],
		load: vi.fn()
	};
	specialDaysStoreMock.load.mockImplementation((items: typeof specialDaysStoreMock.items, orgId: string) => {
		specialDaysStoreMock.items = items;
		specialDaysStoreMock.orgId = orgId;
	});
	const dailyAssignmentsStoreMock = {
		orgId: 'org-1',
		types: [
			{
				id: 'at1',
				name: 'CQ',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#ef4444',
				exemptPersonnelIds: [],
				showInDateHeader: false
			}
		],
		assignments: [{ id: 'da1', date: '2026-03-01', assignmentTypeId: 'at1', assigneeId: 'p1' }],
		load: vi.fn()
	};
	dailyAssignmentsStoreMock.load.mockImplementation(
		(
			types: typeof dailyAssignmentsStoreMock.types,
			assignments: typeof dailyAssignmentsStoreMock.assignments,
			orgId: string
		) => {
			dailyAssignmentsStoreMock.types = types;
			dailyAssignmentsStoreMock.assignments = assignments;
			dailyAssignmentsStoreMock.orgId = orgId;
		}
	);
	return {
		availabilityStoreMock,
		specialDaysStoreMock,
		dailyAssignmentsStoreMock,
		fetchMock: vi.fn()
	};
});

vi.stubGlobal('fetch', fetchMock);

vi.mock('$features/calendar/stores/availability.svelte', () => ({
	availabilityStore: availabilityStoreMock
}));

vi.mock('$features/calendar/stores/specialDays.svelte', () => ({
	specialDaysStore: specialDaysStoreMock
}));

vi.mock('$features/calendar/stores/dailyAssignments.svelte', () => ({
	dailyAssignmentsStore: dailyAssignmentsStoreMock
}));

import { loadCalendarRange, mergeCalendarRangeIntoStores } from './calendarRangeLoader';

describe('calendarRangeLoader', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		availabilityStoreMock.orgId = 'org-1';
		availabilityStoreMock.items = [
			{ id: 'a1', personnelId: 'p1', statusTypeId: 'st1', startDate: '2026-03-01', endDate: '2026-03-05', note: null }
		];
		specialDaysStoreMock.orgId = 'org-1';
		specialDaysStoreMock.items = [{ id: 'sd1', name: 'Existing', date: '2026-03-01', type: 'org-closure' }];
		dailyAssignmentsStoreMock.orgId = 'org-1';
		dailyAssignmentsStoreMock.types = [
			{
				id: 'at1',
				name: 'CQ',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#ef4444',
				exemptPersonnelIds: [],
				showInDateHeader: false
			}
		];
		dailyAssignmentsStoreMock.assignments = [
			{ id: 'da1', date: '2026-03-01', assignmentTypeId: 'at1', assigneeId: 'p1' }
		];
	});

	it('fetches the requested calendar range from the dedicated range endpoint', async () => {
		const payload: CalendarRangeData = {
			rangeStart: '2026-03-01',
			rangeEnd: '2026-06-30',
			availabilityEntries: [],
			specialDays: [],
			dailyAssignments: [],
			advancedDutyEvents: []
		};
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => payload
		});

		await expect(loadCalendarRange('org-1', { rangeStart: '2026-03-01', rangeEnd: '2026-06-30' })).resolves.toEqual(
			payload
		);
		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/calendar-range?rangeStart=2026-03-01&rangeEnd=2026-06-30');
	});

	it('replaces stale in-range calendar data while keeping existing out-of-range store state', () => {
		availabilityStoreMock.items = [
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
		];
		specialDaysStoreMock.items = [
			{ id: 'stale-special-day-in-range', name: 'Stale', date: '2026-03-15', type: 'org-closure' },
			{ id: 'kept-special-day-out-of-range', name: 'Retained', date: '2026-02-15', type: 'org-closure' }
		];
		dailyAssignmentsStoreMock.assignments = [
			{ id: 'stale-in-range', date: '2026-03-15', assignmentTypeId: 'at1', assigneeId: 'p1' },
			{ id: 'kept-out-of-range', date: '2026-02-15', assignmentTypeId: 'at1', assigneeId: 'p1' }
		];

		mergeCalendarRangeIntoStores('org-1', {
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
			dailyAssignments: [{ id: 'da2', date: '2026-06-10', assignmentTypeId: 'at1', assigneeId: 'p2' }],
			advancedDutyEvents: []
		});

		expect(availabilityStoreMock.orgId).toBe('org-1');
		expect(availabilityStoreMock.items).toEqual([
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
		expect(specialDaysStoreMock.orgId).toBe('org-1');
		expect(specialDaysStoreMock.items).toEqual([
			{ id: 'kept-special-day-out-of-range', name: 'Retained', date: '2026-02-15', type: 'org-closure' },
			{ id: 'sd2', name: 'Incoming', date: '2026-06-01', type: 'org-closure' }
		]);
		expect(dailyAssignmentsStoreMock.orgId).toBe('org-1');
		expect(dailyAssignmentsStoreMock.assignments).toEqual([
			{ id: 'kept-out-of-range', date: '2026-02-15', assignmentTypeId: 'at1', assigneeId: 'p1' },
			{ id: 'da2', date: '2026-06-10', assignmentTypeId: 'at1', assigneeId: 'p2' }
		]);
		expect(dailyAssignmentsStoreMock.types).toEqual([
			{
				id: 'at1',
				name: 'CQ',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#ef4444',
				exemptPersonnelIds: [],
				showInDateHeader: false
			}
		]);
	});
});

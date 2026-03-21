import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000099';

// Mock repos
const mockAvailabilityList = vi.fn();
const mockSpecialDayQueryDateRange = vi.fn();
const mockAssignmentTypeList = vi.fn();
const mockDailyAssignmentQueryDateRange = vi.fn();
const mockRosterHistoryList = vi.fn();
const mockPinnedGroupList = vi.fn();

vi.mock('$lib/server/repositories', () => ({
	availabilityRepo: { list: mockAvailabilityList, query: vi.fn(), queryDateRange: vi.fn(), queryByIds: vi.fn() },
	specialDayRepo: { list: vi.fn(), query: vi.fn(), queryDateRange: mockSpecialDayQueryDateRange, queryByIds: vi.fn() },
	assignmentTypeRepo: { list: mockAssignmentTypeList, query: vi.fn(), queryDateRange: vi.fn(), queryByIds: vi.fn() },
	dailyAssignmentRepo: {
		list: vi.fn(),
		query: vi.fn(),
		queryDateRange: mockDailyAssignmentQueryDateRange,
		queryByIds: vi.fn()
	},
	rosterHistoryRepo: { list: mockRosterHistoryList, query: vi.fn(), queryDateRange: vi.fn(), queryByIds: vi.fn() },
	pinnedGroupRepo: { list: mockPinnedGroupList, query: vi.fn(), queryDateRange: vi.fn(), queryByIds: vi.fn() }
}));

function setupMockDefaults() {
	const availEntries = [
		{ id: 'a1', personnelId: 'p1', statusTypeId: 'st1', startDate: '2026-03-01', endDate: '2026-03-05', note: null }
	];
	const specialDays = [{ id: 'sd1', date: '2026-01-01', name: 'New Year', type: 'federal-holiday' }];
	const assignmentTypes = [
		{ id: 'at1', name: 'CQ', shortName: 'CQ', assignTo: 'personnel', color: '#ef4444', exemptPersonnelIds: [] }
	];
	const dailyAssignments = [{ id: 'da1', date: '2026-03-01', assignmentTypeId: 'at1', assigneeId: 'p1' }];
	const rosterHistory = [
		{
			id: 'rh1',
			assignmentTypeId: 'at1',
			name: 'CQ Roster',
			startDate: '2026-03-01',
			endDate: '2026-03-31',
			roster: [],
			config: {},
			createdAt: '2026-03-01T00:00:00Z'
		}
	];

	mockAvailabilityList.mockResolvedValue(availEntries);
	mockSpecialDayQueryDateRange.mockResolvedValue({ data: specialDays, count: null, error: null });
	mockAssignmentTypeList.mockResolvedValue(assignmentTypes);
	mockDailyAssignmentQueryDateRange.mockResolvedValue({ data: dailyAssignments, count: null, error: null });
	mockRosterHistoryList.mockResolvedValue(rosterHistory);
	mockPinnedGroupList.mockResolvedValue(['Alpha']);

	return { availEntries, specialDays, assignmentTypes, dailyAssignments, rosterHistory };
}

describe('fetchCalendarData', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns all expected data fields using repos', async () => {
		const { availEntries, specialDays, assignmentTypes, dailyAssignments, rosterHistory } = setupMockDefaults();

		const { fetchCalendarData } = await import('./calendarData');
		const result = await fetchCalendarData({} as never, ORG_ID, USER_ID);

		expect(result.availabilityEntries).toEqual(availEntries);
		expect(result.specialDays).toEqual(specialDays);
		expect(result.assignmentTypes).toEqual(assignmentTypes);
		expect(result.dailyAssignments).toEqual(dailyAssignments);
		expect(result.rosterHistory).toEqual(rosterHistory);
		expect(result.pinnedGroups).toEqual(['Alpha']);
	});

	it('uses availability repo with custom overlap filters for date range', async () => {
		setupMockDefaults();

		const { fetchCalendarData } = await import('./calendarData');
		await fetchCalendarData({} as never, ORG_ID, USER_ID);

		// availabilityRepo.list should be called with custom filters (not queryDateRange)
		// because availability uses a two-column overlap query
		expect(mockAvailabilityList).toHaveBeenCalledWith(
			expect.anything(),
			ORG_ID,
			expect.objectContaining({ filters: expect.any(Array) })
		);
	});

	it('uses queryDateRange for special days and daily assignments', async () => {
		setupMockDefaults();

		const { fetchCalendarData } = await import('./calendarData');
		await fetchCalendarData({} as never, ORG_ID, USER_ID);

		expect(mockSpecialDayQueryDateRange).toHaveBeenCalledWith(
			expect.anything(),
			ORG_ID,
			expect.objectContaining({ column: 'date' })
		);
		expect(mockDailyAssignmentQueryDateRange).toHaveBeenCalledWith(
			expect.anything(),
			ORG_ID,
			expect.objectContaining({ column: 'date' })
		);
	});

	it('limits roster history to 50 entries', async () => {
		setupMockDefaults();

		const { fetchCalendarData } = await import('./calendarData');
		await fetchCalendarData({} as never, ORG_ID, USER_ID);

		expect(mockRosterHistoryList).toHaveBeenCalledWith(
			expect.anything(),
			ORG_ID,
			expect.objectContaining({ limit: 50 })
		);
	});

	it('filters pinned groups by user_id via repo', async () => {
		setupMockDefaults();

		const { fetchCalendarData } = await import('./calendarData');
		await fetchCalendarData({} as never, ORG_ID, USER_ID);

		expect(mockPinnedGroupList).toHaveBeenCalledWith(
			expect.anything(),
			ORG_ID,
			expect.objectContaining({ filters: expect.any(Array) })
		);
	});

	it('returns empty pinned groups when no userId', async () => {
		setupMockDefaults();

		const { fetchCalendarData } = await import('./calendarData');
		const result = await fetchCalendarData({} as never, ORG_ID, null);

		expect(result.pinnedGroups).toEqual([]);
		expect(mockPinnedGroupList).not.toHaveBeenCalled();
	});
});

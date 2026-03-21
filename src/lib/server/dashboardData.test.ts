import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000099';

// Mock repos
const mockAvailabilityList = vi.fn();
const mockAssignmentTypeList = vi.fn();
const mockDailyAssignmentList = vi.fn();
const mockPinnedGroupList = vi.fn();
const mockRatingSchemeList = vi.fn();

vi.mock('$lib/server/repositories', () => ({
	availabilityRepo: { list: mockAvailabilityList, query: vi.fn(), queryDateRange: vi.fn(), queryByIds: vi.fn() },
	dailyAssignmentRepo: {
		list: mockDailyAssignmentList,
		query: vi.fn(),
		queryDateRange: vi.fn(),
		queryByIds: vi.fn()
	},
	pinnedGroupRepo: { list: mockPinnedGroupList, query: vi.fn(), queryDateRange: vi.fn(), queryByIds: vi.fn() },
	ratingSchemeRepo: { list: mockRatingSchemeList, query: vi.fn(), queryDateRange: vi.fn(), queryByIds: vi.fn() }
}));

vi.mock('$lib/server/entities/assignmentType', () => ({
	AssignmentTypeEntity: {
		repo: { list: mockAssignmentTypeList, query: vi.fn(), queryDateRange: vi.fn(), queryByIds: vi.fn() }
	}
}));

// Mock onboarding repo
const mockFindOnboardings = vi.fn();
vi.mock('$lib/server/onboardingRepository', () => ({
	findOnboardings: mockFindOnboardings
}));

function createMockSupabase(responseData: Record<string, unknown>[] | null = [], responseCount: number | null = 0) {
	const builder: Record<string, unknown> = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockResolvedValue({ data: null }),
		then: undefined
	};

	Object.defineProperty(builder, 'then', {
		value: (resolve: (val: unknown) => void) => {
			resolve({ data: responseData, error: null, count: responseCount });
		}
	});

	return { from: vi.fn().mockReturnValue(builder), _builder: builder };
}

const availEntries = [
	{ id: 'a1', personnelId: 'p1', statusTypeId: 'st1', startDate: '2026-03-01', endDate: '2026-03-05', note: null }
];
const assignmentTypes = [
	{ id: 'at1', name: 'CQ', shortName: 'CQ', assignTo: 'personnel', color: '#ef4444', exemptPersonnelIds: [] }
];
const dailyAssignments = [{ id: 'da1', date: '2026-03-20', assignmentTypeId: 'at1', assigneeId: 'p1' }];
const pinnedGroups = ['Alpha', 'Bravo'];
const ratingSchemeEntries = [{ id: 'rs1', ratedPersonId: 'p1', evalType: 'NCOER', status: 'active' }];
const onboardings = [{ id: 'o1', personnelId: 'p1', status: 'in_progress', startedAt: '2026-03-01', steps: [] }];

function setupMockDefaults() {
	mockAvailabilityList.mockResolvedValue(availEntries);
	mockAssignmentTypeList.mockResolvedValue(assignmentTypes);
	mockDailyAssignmentList.mockResolvedValue(dailyAssignments);
	mockPinnedGroupList.mockResolvedValue(pinnedGroups);
	mockRatingSchemeList.mockResolvedValue(ratingSchemeEntries);
	mockFindOnboardings.mockResolvedValue({ data: onboardings, error: null });
}

describe('fetchDashboardData', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns all expected data fields using repos', async () => {
		setupMockDefaults();
		const supabase = createMockSupabase();

		const { fetchDashboardData } = await import('./dashboardData');
		const result = await fetchDashboardData(supabase, ORG_ID, USER_ID);

		expect(result.availabilityEntries).toEqual(availEntries);
		expect(result.assignmentTypes).toEqual(assignmentTypes);
		expect(result.todayAssignments).toEqual(dailyAssignments);
		expect(result.pinnedGroups).toEqual(pinnedGroups);
		expect(result.ratingSchemeEntries).toEqual(ratingSchemeEntries);
		expect(result.activeOnboardings).toEqual(onboardings);
	});

	it('filters availability and daily assignments with date range filters', async () => {
		setupMockDefaults();
		const supabase = createMockSupabase();

		const { fetchDashboardData } = await import('./dashboardData');
		await fetchDashboardData(supabase, ORG_ID, USER_ID);

		expect(mockAvailabilityList).toHaveBeenCalledWith(
			expect.anything(),
			ORG_ID,
			expect.objectContaining({ filters: expect.any(Array) })
		);
		expect(mockDailyAssignmentList).toHaveBeenCalledWith(
			expect.anything(),
			ORG_ID,
			expect.objectContaining({ filters: expect.any(Array) })
		);
	});

	it('filters pinned groups by user_id', async () => {
		setupMockDefaults();
		const supabase = createMockSupabase();

		const { fetchDashboardData } = await import('./dashboardData');
		await fetchDashboardData(supabase, ORG_ID, USER_ID);

		expect(mockPinnedGroupList).toHaveBeenCalledWith(
			expect.anything(),
			ORG_ID,
			expect.objectContaining({ filters: expect.any(Array) })
		);
	});

	it('returns empty pinned groups when no userId', async () => {
		setupMockDefaults();
		const supabase = createMockSupabase();

		const { fetchDashboardData } = await import('./dashboardData');
		const result = await fetchDashboardData(supabase, ORG_ID, null);

		expect(result.pinnedGroups).toEqual([]);
		expect(mockPinnedGroupList).not.toHaveBeenCalled();
	});

	it('filters rating scheme entries to exclude completed', async () => {
		setupMockDefaults();
		const supabase = createMockSupabase();

		const { fetchDashboardData } = await import('./dashboardData');
		await fetchDashboardData(supabase, ORG_ID, USER_ID);

		expect(mockRatingSchemeList).toHaveBeenCalledWith(
			expect.anything(),
			ORG_ID,
			expect.objectContaining({
				select: 'id, rated_person_id, eval_type, rating_period_end, status',
				filters: expect.any(Array)
			})
		);
	});

	it('uses onboarding repo findOnboardings', async () => {
		setupMockDefaults();
		const supabase = createMockSupabase();

		const { fetchDashboardData } = await import('./dashboardData');
		await fetchDashboardData(supabase, ORG_ID, USER_ID);

		expect(mockFindOnboardings).toHaveBeenCalledWith(expect.anything(), ORG_ID);
	});
});

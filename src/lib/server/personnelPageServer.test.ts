import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000099';

const mockPinnedGroupList = vi.fn();
const mockRatingSchemeList = vi.fn();

vi.mock('$lib/server/entities/pinnedGroups', () => ({
	PinnedGroupsEntity: {
		repo: { list: mockPinnedGroupList, query: vi.fn(), queryDateRange: vi.fn(), queryByIds: vi.fn() }
	}
}));

vi.mock('$lib/server/entities/ratingSchemeEntry', () => ({
	RatingSchemeEntryEntity: {
		repo: { list: mockRatingSchemeList, query: vi.fn(), queryDateRange: vi.fn(), queryByIds: vi.fn() }
	}
}));

function setupMockDefaults() {
	mockPinnedGroupList.mockResolvedValue(['Alpha', 'Bravo']);
	mockRatingSchemeList.mockResolvedValue([{ id: 'rs1', ratedPersonId: 'p1', evalType: 'NCOER', status: 'active' }]);
}

describe('fetchPersonnelData', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns pinned groups and rating scheme entries using repos', async () => {
		setupMockDefaults();

		const { fetchPersonnelData } = await import('./personnelPageServer');
		const result = await fetchPersonnelData({} as never, ORG_ID, USER_ID);

		expect(result.pinnedGroups).toEqual(['Alpha', 'Bravo']);
		expect(result.ratingSchemeEntries).toEqual([
			{ id: 'rs1', ratedPersonId: 'p1', evalType: 'NCOER', status: 'active' }
		]);
	});

	it('filters pinned groups by user_id', async () => {
		setupMockDefaults();

		const { fetchPersonnelData } = await import('./personnelPageServer');
		await fetchPersonnelData({} as never, ORG_ID, USER_ID);

		expect(mockPinnedGroupList).toHaveBeenCalledWith(
			expect.anything(),
			ORG_ID,
			expect.objectContaining({ filters: expect.any(Array) })
		);
	});

	it('returns empty pinned groups when no userId', async () => {
		setupMockDefaults();

		const { fetchPersonnelData } = await import('./personnelPageServer');
		const result = await fetchPersonnelData({} as never, ORG_ID, null);

		expect(result.pinnedGroups).toEqual([]);
		expect(mockPinnedGroupList).not.toHaveBeenCalled();
	});
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

const mockPersonnelTrainings = [
	{
		id: 'pt1',
		personnelId: 'p1',
		trainingTypeId: 'tt1',
		completedDate: '2026-01-15',
		expirationDate: '2027-01-15',
		notes: null
	},
	{
		id: 'pt2',
		personnelId: 'p2',
		trainingTypeId: 'tt1',
		completedDate: '2026-02-01',
		expirationDate: '2027-02-01',
		notes: 'Completed online'
	}
];

const mockPersonnel = [
	{ id: 'p1', firstName: 'John', lastName: 'Doe', groupId: 'g1' },
	{ id: 'p2', firstName: 'Jane', lastName: 'Smith', groupId: 'g2' }
];

const mockList = vi.fn();

vi.mock('$lib/server/repositories', () => ({
	personnelTrainingRepo: {
		list: (...args: unknown[]) => mockList(...args)
	}
}));

vi.mock('$lib/server/supabase', () => ({
	getSupabaseClient: () => ({})
}));

describe('training layout server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockList.mockResolvedValue(mockPersonnelTrainings);
	});

	it('returns personnelTrainings and orgId, and registers depends key', async () => {
		const { load } = await import('../../routes/org/[orgId]/training/+layout.server');

		const dependsKeys: string[] = [];
		const result = await load({
			params: { orgId: ORG_ID },
			locals: { user: { id: 'user1' } },
			cookies: {},
			depends: (key: string) => dependsKeys.push(key),
			parent: async () => ({
				orgId: ORG_ID,
				scopedGroupId: null,
				personnel: mockPersonnel
			})
		} as never);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = result as any;
		expect(mockList).toHaveBeenCalledWith(expect.anything(), ORG_ID);
		expect(data.personnelTrainings).toEqual(mockPersonnelTrainings);
		expect(data.orgId).toBe(ORG_ID);
		expect(dependsKeys).toContain('app:training-data');
	});

	it('filters personnelTrainings to scoped personnel when scopedGroupId is set', async () => {
		const { load } = await import('../../routes/org/[orgId]/training/+layout.server');

		const result = await load({
			params: { orgId: ORG_ID },
			locals: { user: { id: 'user1' } },
			cookies: {},
			depends: () => {},
			parent: async () => ({
				orgId: ORG_ID,
				scopedGroupId: 'g1',
				// Parent layout already returns only scoped personnel
				personnel: [mockPersonnel[0]]
			})
		} as never);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = result as any;
		// Only p1 is in scoped personnel, so only pt1 should remain
		expect(data.personnelTrainings).toEqual([mockPersonnelTrainings[0]]);
	});

	it('returns empty personnelTrainings when scoped group has no personnel', async () => {
		const { load } = await import('../../routes/org/[orgId]/training/+layout.server');

		const result = await load({
			params: { orgId: ORG_ID },
			locals: { user: { id: 'user1' } },
			cookies: {},
			depends: () => {},
			parent: async () => ({
				orgId: ORG_ID,
				scopedGroupId: 'g-nonexistent',
				// Parent layout returns empty personnel for non-existent group
				personnel: []
			})
		} as never);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = result as any;
		expect(data.personnelTrainings).toEqual([]);
	});
});

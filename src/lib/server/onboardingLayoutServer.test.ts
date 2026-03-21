import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

const mockTemplates = [{ id: 't1', name: 'Basic Training', organizationId: ORG_ID }];
const mockTemplateSteps = [{ id: 'ts1', templateId: 't1', name: 'Step 1', sortOrder: 0, organizationId: ORG_ID }];
const mockOnboardings = [{ id: 'o1', personnelId: 'p1', templateId: 't1', status: 'active', organizationId: ORG_ID }];
const mockPersonnelTrainings = [{ id: 'pt1', personnelId: 'p1', trainingTypeId: 'tt1', completedDate: '2026-03-01' }];

const mockFindTemplates = vi.fn();
const mockFindTemplateSteps = vi.fn();
const mockFindOnboardings = vi.fn();
const mockPersonnelTrainingList = vi.fn();

vi.mock('$lib/server/onboardingRepository', () => ({
	findTemplates: (...args: unknown[]) => mockFindTemplates(...args),
	findTemplateSteps: (...args: unknown[]) => mockFindTemplateSteps(...args),
	findOnboardings: (...args: unknown[]) => mockFindOnboardings(...args)
}));

vi.mock('$lib/server/entities/personnelTraining', () => ({
	PersonnelTrainingEntity: {
		repo: {
			list: (...args: unknown[]) => mockPersonnelTrainingList(...args)
		}
	}
}));

vi.mock('$lib/server/supabase', () => ({
	getSupabaseClient: () => ({})
}));

describe('onboarding layout server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFindTemplates.mockResolvedValue({ data: mockTemplates, error: null });
		mockFindTemplateSteps.mockResolvedValue({ data: mockTemplateSteps, error: null });
		mockFindOnboardings.mockResolvedValue({ data: mockOnboardings, error: null });
		mockPersonnelTrainingList.mockResolvedValue(mockPersonnelTrainings);
	});

	it('returns all onboarding data fields and registers depends key', async () => {
		const { load } = await import('../../routes/org/[orgId]/onboarding/+layout.server');

		const dependsKeys: string[] = [];
		const result = await load({
			params: { orgId: ORG_ID },
			locals: { user: { id: 'user1' } },
			cookies: {},
			depends: (key: string) => dependsKeys.push(key),
			parent: async () => ({
				scopedGroupId: null,
				personnel: [{ id: 'p1' }, { id: 'p2' }]
			})
		} as never);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SvelteKit load return type doesn't expose layout data shape in tests
		const data = result as any;
		expect(data.orgId).toBe(ORG_ID);
		expect(data.onboardingTemplates).toEqual(mockTemplates);
		expect(data.onboardingTemplateSteps).toEqual(mockTemplateSteps);
		expect(data.onboardings).toEqual(mockOnboardings);
		expect(data.personnelTrainings).toEqual(mockPersonnelTrainings);
		expect(dependsKeys).toContain('app:onboarding-data');
	});

	it('passes scopedPersonnelIds to findOnboardings when scopedGroupId is set', async () => {
		const { load } = await import('../../routes/org/[orgId]/onboarding/+layout.server');

		const dependsKeys: string[] = [];
		await load({
			params: { orgId: ORG_ID },
			locals: { user: { id: 'user1' } },
			cookies: {},
			depends: (key: string) => dependsKeys.push(key),
			parent: async () => ({
				scopedGroupId: 'group1',
				personnel: [{ id: 'p1' }, { id: 'p3' }]
			})
		} as never);

		// When scopedGroupId is set, findOnboardings should receive a Set of personnel IDs
		const scopedIds = mockFindOnboardings.mock.calls[0][2];
		expect(scopedIds).toBeInstanceOf(Set);
		expect(scopedIds.has('p1')).toBe(true);
		expect(scopedIds.has('p3')).toBe(true);
		expect(scopedIds.size).toBe(2);
	});

	it('passes null scopedPersonnelIds when scopedGroupId is null', async () => {
		const { load } = await import('../../routes/org/[orgId]/onboarding/+layout.server');

		await load({
			params: { orgId: ORG_ID },
			locals: { user: { id: 'user1' } },
			cookies: {},
			depends: () => {},
			parent: async () => ({
				scopedGroupId: null,
				personnel: [{ id: 'p1' }]
			})
		} as never);

		const scopedIds = mockFindOnboardings.mock.calls[0][2];
		expect(scopedIds).toBeNull();
	});
});

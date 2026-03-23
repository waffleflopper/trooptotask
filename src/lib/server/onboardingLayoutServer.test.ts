import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

const mockTemplates = [{ id: 't1', name: 'Basic Training', orgId: ORG_ID }];
const mockTemplateSteps = [{ id: 'ts1', templateId: 't1', name: 'Step 1', sortOrder: 0 }];
const mockOnboardings = [
	{
		id: 'o1',
		personnelId: 'p1',
		templateId: 't1',
		status: 'in_progress',
		steps: [{ id: 's1', stepType: 'checkbox', active: true, completed: false }]
	}
];

const mockTemplateList = vi.fn();
const mockTemplateStepList = vi.fn();
const mockOnboardingList = vi.fn();

vi.mock('$lib/server/entities/onboardingTemplate', () => ({
	OnboardingTemplateEntity: { repo: { list: (...args: unknown[]) => mockTemplateList(...args) } }
}));

vi.mock('$lib/server/entities/onboardingTemplateStep', () => ({
	OnboardingTemplateStepEntity: { repo: { list: (...args: unknown[]) => mockTemplateStepList(...args) } }
}));

vi.mock('$lib/server/entities/personnelOnboarding', () => ({
	PersonnelOnboardingEntity: { repo: { list: (...args: unknown[]) => mockOnboardingList(...args) } }
}));

vi.mock('$lib/server/supabase', () => ({
	getSupabaseClient: () => ({})
}));

vi.mock('$lib/server/adapters/supabaseDataStore', () => ({
	createSupabaseDataStore: () => ({})
}));

vi.mock('$lib/server/adapters/supabaseReadOnlyGuard', () => ({
	createSupabaseReadOnlyGuard: () => ({ check: async () => false })
}));

vi.mock('$lib/server/adapters/supabaseAudit', () => ({
	createSupabaseAuditAdapter: () => ({ log: () => {} })
}));

vi.mock('$lib/server/adapters/supabaseAuthContext', () => ({
	createSupabaseAuthContextAdapter: () => ({
		orgId: ORG_ID,
		requireEdit: () => {},
		requireView: () => {}
	})
}));

vi.mock('$lib/server/permissionContext', () => ({
	createPermissionContext: async () => ({})
}));

vi.mock('$lib/server/core/useCases/onboardingStepProgress', () => ({
	refreshTrainingSteps: vi.fn().mockResolvedValue([])
}));

describe('onboarding layout server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockTemplateList.mockResolvedValue(mockTemplates);
		mockTemplateStepList.mockResolvedValue(mockTemplateSteps);
		mockOnboardingList.mockResolvedValue(mockOnboardings);
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
				personnel: [{ id: 'p1' }, { id: 'p2' }],
				userId: 'user1'
			})
		} as never);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SvelteKit load return type doesn't expose layout data shape in tests
		const data = result as any;
		expect(data.orgId).toBe(ORG_ID);
		expect(data.onboardingTemplates).toEqual(mockTemplates);
		expect(data.onboardingTemplateSteps).toEqual(mockTemplateSteps);
		expect(data.onboardings).toEqual(mockOnboardings);
		expect(dependsKeys).toContain('app:onboarding-data');
	});

	it('filters onboardings by scoped personnel IDs when scopedGroupId is set', async () => {
		mockOnboardingList.mockResolvedValue([
			{ id: 'o1', personnelId: 'p1', templateId: 't1', status: 'in_progress', steps: [] },
			{ id: 'o2', personnelId: 'p-other', templateId: 't1', status: 'in_progress', steps: [] }
		]);

		const { load } = await import('../../routes/org/[orgId]/onboarding/+layout.server');

		const result = await load({
			params: { orgId: ORG_ID },
			locals: { user: { id: 'user1' } },
			cookies: {},
			depends: () => {},
			parent: async () => ({
				scopedGroupId: 'group1',
				personnel: [{ id: 'p1' }],
				userId: 'user1'
			})
		} as never);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = result as any;
		expect(data.onboardings).toHaveLength(1);
		expect(data.onboardings[0].personnelId).toBe('p1');
	});

	it('returns all onboardings when scopedGroupId is null', async () => {
		mockOnboardingList.mockResolvedValue([
			{ id: 'o1', personnelId: 'p1', templateId: 't1', status: 'in_progress', steps: [] },
			{ id: 'o2', personnelId: 'p2', templateId: 't1', status: 'in_progress', steps: [] }
		]);

		const { load } = await import('../../routes/org/[orgId]/onboarding/+layout.server');

		const result = await load({
			params: { orgId: ORG_ID },
			locals: { user: { id: 'user1' } },
			cookies: {},
			depends: () => {},
			parent: async () => ({
				scopedGroupId: null,
				personnel: [{ id: 'p1' }, { id: 'p2' }],
				userId: 'user1'
			})
		} as never);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = result as any;
		expect(data.onboardings).toHaveLength(2);
	});
});

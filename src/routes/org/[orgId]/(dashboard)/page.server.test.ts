import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';
import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';

const {
	loadWithContextMock,
	fetchTrainingSummaryMock,
	fetchOnboardingTrainingCompletionsMock,
	findManyWithCountMock,
	findManyMock,
	mockCtx
} = vi.hoisted(() => {
	const findManyWithCountMock = vi.fn();
	const findManyMock = vi.fn();

	return {
		loadWithContextMock: vi.fn(),
		fetchTrainingSummaryMock: vi.fn(),
		fetchOnboardingTrainingCompletionsMock: vi.fn(),
		findManyWithCountMock,
		findManyMock,
		mockCtx: {
			auth: {
				orgId: 'org-1',
				userId: 'user-1'
			},
			store: {
				findManyWithCount: findManyWithCountMock,
				findMany: findManyMock
			}
		}
	};
});

vi.mock('$lib/server/adapters/httpAdapter', () => ({
	loadWithContext: loadWithContextMock
}));

vi.mock('$lib/server/core/useCases/trainingSummaryQuery', () => ({
	fetchTrainingSummary: fetchTrainingSummaryMock,
	fetchOnboardingTrainingCompletions: fetchOnboardingTrainingCompletionsMock
}));

import { load } from './+page.server';

describe('dashboard page server load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadWithContextMock.mockImplementation(async (_locals, _cookies, _orgId, config) => ({ data: config.fn(mockCtx) }));
		fetchTrainingSummaryMock.mockResolvedValue({ stats: null, issues: [] });
		fetchOnboardingTrainingCompletionsMock.mockResolvedValue([]);
		findManyWithCountMock.mockResolvedValue({ count: 3 });
		findManyMock.mockResolvedValue([{ dismissed_at: null }]);
	});

	it('streams summary work without requiring the parent workspace bootstrap to resolve first', async () => {
		let resolveWorkspace: ((value: WorkspaceBootstrap<DashboardBootstrap>) => void) | undefined;
		const workspaceBootstrap = new Promise<WorkspaceBootstrap<DashboardBootstrap>>((resolve) => {
			resolveWorkspace = resolve;
		});
		const depends = vi.fn();
		const parent = vi.fn().mockResolvedValue({
			dashboard: {
				data: workspaceBootstrap
			}
		});

		const result = await load({
			params: { orgId: 'org-1' },
			locals: {},
			cookies: {},
			depends,
			parent
		} as never);

		expect(depends).toHaveBeenCalledWith('app:org-core');
		expect(depends).toHaveBeenCalledWith('app:dashboard-data');
		expect(result.summary).toBeInstanceOf(Promise);
		expect(fetchTrainingSummaryMock).not.toHaveBeenCalled();

		resolveWorkspace?.({
			workspace: 'dashboard',
			data: {
				availabilityEntries: [],
				assignmentTypes: [],
				todayAssignments: [],
				pinnedGroups: [],
				ratingSchemeEntries: [],
				activeOnboardings: [],
				todayDutyEvents: [],
				personnel: [],
				groups: [],
				statusTypes: [],
				trainingTypes: []
			}
		});

		await expect(result.summary).resolves.toEqual({
			trainingSummary: { stats: null, issues: [] },
			onboardingTrainingCompletions: [],
			onboardingTemplateStepCount: 3,
			ratingSchemeEntryCount: 3,
			orgMemberCount: 3,
			gettingStartedDismissed: false
		});
		expect(fetchTrainingSummaryMock).toHaveBeenCalledOnce();
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';
import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';

const { buildLayoutContextMock, fetchDashboardTrainingSummaryMock, findManyWithCountMock, findManyMock, mockCtx } =
	vi.hoisted(() => {
		const ORG_ID = '11111111-1111-1111-1111-111111111111';
		const findManyWithCountMock = vi.fn();
		const findManyMock = vi.fn();

		return {
			buildLayoutContextMock: vi.fn(),
			fetchDashboardTrainingSummaryMock: vi.fn(),
			findManyWithCountMock,
			findManyMock,
			mockCtx: {
				auth: {
					orgId: ORG_ID,
					userId: 'user-1',
					requireView: vi.fn(),
					requireEdit: vi.fn(),
					requirePrivileged: vi.fn(),
					requireOwner: vi.fn(),
					requireManageMembers: vi.fn()
				},
				store: {
					findManyWithCount: findManyWithCountMock,
					findMany: findManyMock
				}
			}
		};
	});

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);
	return {
		...actual,
		buildLayoutContext: buildLayoutContextMock
	};
});

vi.mock('$lib/server/core/useCases/trainingSummaryQuery', () => ({
	fetchDashboardTrainingSummary: fetchDashboardTrainingSummaryMock
}));

import { load } from './+page.server';

const ORG_ID = '11111111-1111-1111-1111-111111111111';

describe('dashboard page server load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		buildLayoutContextMock.mockResolvedValue(mockCtx);
		fetchDashboardTrainingSummaryMock.mockResolvedValue({
			trainingSummary: { stats: null, issues: [] },
			onboardingTrainingCompletions: new Set<string>()
		});
		findManyWithCountMock.mockResolvedValue({ count: 3 });
		findManyMock.mockResolvedValue([{ dismissed_at: null }]);
	});

	it('streams dashboard summary without starting non-critical support queries in the page server load', async () => {
		const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
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
			params: { orgId: ORG_ID },
			locals: {},
			cookies: {},
			depends,
			parent
		} as never);

		expect(depends).toHaveBeenCalledWith('app:org-core');
		expect(depends).toHaveBeenCalledWith('app:dashboard-data');
		expect(result.summary).toBeInstanceOf(Promise);
		expect(fetchDashboardTrainingSummaryMock).not.toHaveBeenCalled();
		expect(findManyWithCountMock).not.toHaveBeenCalled();
		expect(findManyMock).not.toHaveBeenCalled();

		resolveWorkspace?.({
			workspace: 'dashboard',
			data: {
				availabilityEntries: [],
				assignmentTypes: [],
				todayAssignments: [],
				pinnedGroups: [],
				ratingSchemeEntries: [],
				activeOnboardings: [{ personnelId: 'p2' }],
				todayDutyEvents: [],
				personnel: [],
				groups: [],
				statusTypes: [],
				trainingTypes: []
			} as unknown as DashboardBootstrap
		});

		await expect(result.summary).resolves.toEqual({
			trainingSummary: { stats: null, issues: [] },
			onboardingTrainingCompletions: []
		});
		expect(consoleInfoSpy).toHaveBeenCalledWith(
			'[dashboard-load]',
			expect.objectContaining({
				orgId: ORG_ID,
				phase: 'summary',
				status: 'ok',
				durationMs: expect.any(Number)
			})
		);
		expect(fetchDashboardTrainingSummaryMock).toHaveBeenCalledOnce();
		expect(fetchDashboardTrainingSummaryMock).toHaveBeenCalledWith(mockCtx, {
			personnel: [],
			trainingTypes: [],
			onboardingPersonnelIds: ['p2'],
			options: {
				issueLimit: 25,
				issueStatuses: ['expired', 'warning-orange']
			}
		});
	});
});

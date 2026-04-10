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

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;

	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

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

	it('streams critical summary separately from non-critical checklist metadata', async () => {
		const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
		let resolveWorkspace: ((value: WorkspaceBootstrap<DashboardBootstrap>) => void) | undefined;
		const workspaceBootstrap = new Promise<WorkspaceBootstrap<DashboardBootstrap>>((resolve) => {
			resolveWorkspace = resolve;
		});
		const onboardingTemplateSteps = createDeferred<{ count: number }>();
		const ratingEntries = createDeferred<{ count: number }>();
		const orgMembers = createDeferred<{ count: number }>();
		const gettingStartedRows = createDeferred<Array<{ dismissed_at: string | null }>>();
		const depends = vi.fn();
		const parent = vi.fn().mockResolvedValue({
			dashboard: {
				data: workspaceBootstrap
			}
		});

		findManyWithCountMock
			.mockReturnValueOnce(onboardingTemplateSteps.promise)
			.mockReturnValueOnce(ratingEntries.promise)
			.mockReturnValueOnce(orgMembers.promise);
		findManyMock.mockReturnValueOnce(gettingStartedRows.promise);

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
		expect(result.support).toBeInstanceOf(Promise);
		expect(fetchDashboardTrainingSummaryMock).not.toHaveBeenCalled();

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
				issueLimit: 5,
				issueStatuses: ['expired', 'warning-orange']
			}
		});

		let supportSettled = false;
		void result.support.then(() => {
			supportSettled = true;
		});
		await Promise.resolve();
		expect(supportSettled).toBe(false);

		onboardingTemplateSteps.resolve({ count: 4 });
		ratingEntries.resolve({ count: 5 });
		orgMembers.resolve({ count: 6 });
		gettingStartedRows.resolve([{ dismissed_at: '2026-01-01T00:00:00Z' }]);

		await expect(result.support).resolves.toEqual({
			onboardingTemplateStepCount: 4,
			ratingSchemeEntryCount: 5,
			orgMemberCount: 6,
			gettingStartedDismissed: true
		});
		expect(consoleInfoSpy).toHaveBeenCalledWith(
			'[dashboard-load]',
			expect.objectContaining({
				orgId: ORG_ID,
				phase: 'support',
				status: 'ok',
				durationMs: expect.any(Number)
			})
		);
	});
});

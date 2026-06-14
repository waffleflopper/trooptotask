import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	DashboardWorkspaceData,
	DashboardWorkspaceResult
} from '$features/dashboard/server/dashboardWorkspaceBootstrap';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';

const {
	buildLayoutContextMock,
	buildRouteContextMock,
	createSupabaseOrgSettingsMemberManagementPortMock,
	fetchCriticalTasksDashboardSummaryMock,
	fetchDashboardTrainingSummaryMock,
	findManyWithCountMock,
	findManyMock,
	leaveOrganizationMock,
	mockCtx
} = vi.hoisted(() => {
	const ORG_ID = '11111111-1111-1111-1111-111111111111';
	const findManyWithCountMock = vi.fn();
	const findManyMock = vi.fn();

	return {
		buildLayoutContextMock: vi.fn(),
		buildRouteContextMock: vi.fn(),
		createSupabaseOrgSettingsMemberManagementPortMock: vi.fn(),
		fetchCriticalTasksDashboardSummaryMock: vi.fn(),
		fetchDashboardTrainingSummaryMock: vi.fn(),
		findManyWithCountMock,
		findManyMock,
		leaveOrganizationMock: vi.fn(),
		mockCtx: {
			auth: {
				orgId: ORG_ID,
				userId: 'user-1',
				role: 'member',
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' },
				isPrivileged: false
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
		buildLayoutContext: buildLayoutContextMock,
		buildRouteContext: buildRouteContextMock
	};
});

vi.mock('$lib/server/adapters/supabaseOrgSettingsMemberManagement', () => ({
	createSupabaseOrgSettingsMemberManagementPort: createSupabaseOrgSettingsMemberManagementPortMock
}));

vi.mock('$lib/server/core/useCases/orgSettingsMemberManagement', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/orgSettingsMemberManagement')>(
		'$lib/server/core/useCases/orgSettingsMemberManagement'
	);

	return {
		...actual,
		leaveOrganization: leaveOrganizationMock
	};
});

vi.mock('$lib/server/core/useCases/trainingSummaryQuery', () => ({
	fetchDashboardTrainingSummary: fetchDashboardTrainingSummaryMock
}));

vi.mock('$lib/server/core/useCases/criticalTasksReportsQuery', () => ({
	fetchCriticalTasksDashboardSummary: fetchCriticalTasksDashboardSummaryMock
}));

import { actions, load } from './+page.server';

const ORG_ID = '11111111-1111-1111-1111-111111111111';

describe('dashboard page server load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		buildLayoutContextMock.mockResolvedValue(mockCtx);
		buildRouteContextMock.mockResolvedValue({
			auth: { kind: 'auth' },
			audit: { kind: 'audit' },
			notifications: { kind: 'notifications' },
			readOnlyGuard: { kind: 'read-only' }
		});
		createSupabaseOrgSettingsMemberManagementPortMock.mockReturnValue({ kind: 'settings-port' });
		leaveOrganizationMock.mockResolvedValue({ success: true });
		fetchDashboardTrainingSummaryMock.mockResolvedValue({
			trainingSummary: { stats: null, issues: [] },
			onboardingTrainingCompletions: new Set<string>()
		});
		fetchCriticalTasksDashboardSummaryMock.mockResolvedValue({
			hasActiveTasks: true,
			kpis: {
				overallReadiness: { percent: 68, deltaPercent: -4, readyCount: 17, applicableCount: 25 },
				soldiersBelow70: { count: 3, totalApplicable: 8, thresholdPercent: 70 },
				tasksExpiringSoon: { count: 5, affectedSoldiers: 4, windowDays: 60 },
				tasksBelowThreshold: { count: 2, thresholdPercent: 70 }
			},
			mosReadiness: [{ mos: '11B', personnelCount: 5, readinessPercent: 60, readyCount: 12, applicableCount: 20 }],
			readinessTrend: {
				months: [
					{
						month: '2026-04',
						label: 'Apr',
						overallReadinessPercent: 68
					}
				]
			},
			projectedReadinessAtMonth6: {
				month: '2026-10',
				label: 'Oct',
				readinessPercent: 64,
				readyCount: 16,
				applicableCount: 25
			},
			tasksBelowThreshold: {
				thresholdPercent: 70,
				count: 2,
				rows: [
					{
						taskId: 'task-1',
						taskCode: 'ICT-1',
						taskName: 'React to contact',
						percentComplete: 40,
						soldierGapCount: 3,
						applicableCount: 5,
						completeCount: 2
					}
				]
			},
			atRiskSoldiers: {
				totalApplicable: 1,
				rows: [
					{
						personnelId: 'person-1',
						soldierName: 'Smith, Ann',
						mos: '11B',
						rank: 'SGT',
						groupName: 'Alpha',
						readinessPercent: 50,
						applicableCount: 4,
						readyCount: 2,
						tasksExpiringSoonCount: 1,
						daysSinceLastIctUpdate: 45,
						lastIctUpdateAt: '2026-03-09'
					}
				]
			}
		});
		findManyWithCountMock.mockResolvedValue({ count: 3 });
		findManyMock.mockResolvedValue([{ dismissed_at: null }]);
	});

	it('streams dashboard summary without starting non-critical support queries in the page server load', async () => {
		const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
		let resolveWorkspace: ((value: DashboardWorkspaceResult) => void) | undefined;
		const workspaceBootstrap = new Promise<DashboardWorkspaceResult>((resolve) => {
			resolveWorkspace = resolve;
		});
		const depends = vi.fn();
		const parent = vi.fn().mockResolvedValue({
			...createReadyAppShellRouteData({ orgId: ORG_ID, criticalTasksCapability: 'view' }),
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
		expect(result).not.toHaveProperty('breadcrumbLabel');
		expect(result.summary).toBeInstanceOf(Promise);
		expect(fetchDashboardTrainingSummaryMock).not.toHaveBeenCalled();
		expect(findManyWithCountMock).not.toHaveBeenCalled();
		expect(findManyMock).not.toHaveBeenCalled();

		resolveWorkspace?.({
			workspaceKey: 'dashboard',
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
				trainingTypes: [],
				lossWarningWindowDays: 180
			} as unknown as DashboardWorkspaceData,
			hydration: { orgId: ORG_ID } as DashboardWorkspaceResult['hydration']
		});

		await expect(result.summary).resolves.toEqual({
			trainingSummary: { stats: null, issues: [] },
			onboardingTrainingCompletions: [],
			ictlSummary: {
				hasActiveTasks: true,
				overallReadinessPercent: 68,
				overallDeltaPercent: -4,
				readyCount: 17,
				applicableCount: 25,
				soldiersBelowThresholdCount: 3,
				soldiersBelowThresholdTotal: 8,
				thresholdPercent: 70,
				expiringSoonCount: 5,
				expiringSoonAffectedSoldiers: 4,
				expiringSoonWindowDays: 60,
				tasksBelowThresholdCount: 2,
				projectedReadinessPercent: 64,
				mosReadiness: [{ mos: '11B', personnelCount: 5, readinessPercent: 60 }],
				trend: [{ month: '2026-04', label: 'Apr', readinessPercent: 68 }],
				tasksBelowThreshold: [
					{
						taskId: 'task-1',
						taskCode: 'ICT-1',
						taskName: 'React to contact',
						percentComplete: 40,
						soldierGapCount: 3
					}
				],
				atRiskSoldiers: [
					{
						personnelId: 'person-1',
						soldierName: 'Smith, Ann',
						mos: '11B',
						rank: 'SGT',
						groupName: 'Alpha',
						readinessPercent: 50,
						tasksExpiringSoonCount: 1,
						daysSinceLastIctUpdate: 45
					}
				]
			}
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
		expect(fetchCriticalTasksDashboardSummaryMock).toHaveBeenCalledOnce();
	});

	it('does not fetch or return Critical Tasks dashboard data without Critical Tasks view access', async () => {
		let resolveWorkspace: ((value: DashboardWorkspaceResult) => void) | undefined;
		const workspaceBootstrap = new Promise<DashboardWorkspaceResult>((resolve) => {
			resolveWorkspace = resolve;
		});
		const parent = vi.fn().mockResolvedValue({
			...createReadyAppShellRouteData({ orgId: ORG_ID, criticalTasksCapability: 'none' }),
			dashboard: {
				data: workspaceBootstrap
			}
		});

		const result = await load({
			params: { orgId: ORG_ID },
			locals: {},
			cookies: {},
			depends: vi.fn(),
			parent
		} as never);

		resolveWorkspace?.({
			workspaceKey: 'dashboard',
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
				trainingTypes: [],
				lossWarningWindowDays: 180
			} as unknown as DashboardWorkspaceData,
			hydration: { orgId: ORG_ID } as DashboardWorkspaceResult['hydration']
		});

		await expect(result.summary).resolves.toEqual({
			trainingSummary: { stats: null, issues: [] },
			onboardingTrainingCompletions: [],
			ictlSummary: null
		});
		expect(fetchCriticalTasksDashboardSummaryMock).not.toHaveBeenCalled();
	});

	it('leaves the organization through the dashboard action and redirects away from the org', async () => {
		await expect(
			actions.leaveOrganization({
				request: new Request(`http://localhost/org/${ORG_ID}?/leaveOrganization`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({
						membershipId: '11111111-1111-4111-8111-111111111111',
						confirmLeaveOrganization: 'YES'
					})
				}),
				locals: {
					user: { id: 'user-1', email: 'user@example.com' },
					supabase: {}
				},
				params: { orgId: ORG_ID },
				cookies: {},
				getClientAddress: () => '127.0.0.1'
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/dashboard?show=all'
		});

		expect(leaveOrganizationMock).toHaveBeenCalledWith(
			{
				auth: { kind: 'auth' },
				audit: { kind: 'audit' },
				notifications: { kind: 'notifications' },
				readOnlyGuard: { kind: 'read-only' },
				settings: { kind: 'settings-port' }
			},
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				confirmation: 'YES',
				actorEmail: 'user@example.com'
			}
		);
	});
});

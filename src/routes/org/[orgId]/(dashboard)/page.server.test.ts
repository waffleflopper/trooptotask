import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardWorkspaceData, DashboardWorkspaceResult } from '$features/dashboard/contracts';
import { createReadyAppShellRouteData } from '../appShell.test-support';
import { requireReadyAppShell } from '$lib/server/adapters/appShellRouteData';

const {
	buildLayoutRequestMock,
	streamDashboardWorkspaceMock,
	buildRouteRequestMock,
	createRequestDashboardSummaryContextMock,
	createRequestNotificationContextMock,
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
		buildLayoutRequestMock: vi.fn(),
		streamDashboardWorkspaceMock: vi.fn(),
		buildRouteRequestMock: vi.fn(),
		createRequestDashboardSummaryContextMock: vi.fn(),
		createRequestNotificationContextMock: vi.fn(),
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
				isPrivileged: false,
				canManageMembers: false
			},
			audit: { log: vi.fn() },
			disabledFeatures: [],
			store: {
				findManyWithCount: findManyWithCountMock,
				findMany: findManyMock
			}
		}
	};
});

vi.mock('$lib/server/adapters/requestContexts.server', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/requestContexts.server')>(
		'$lib/server/adapters/requestContexts.server'
	);
	return {
		...actual,
		buildLayoutRequest: buildLayoutRequestMock,
		buildRouteRequest: buildRouteRequestMock,
		createRequestDashboardSummaryContext: createRequestDashboardSummaryContextMock,
		createRequestNotificationContext: createRequestNotificationContextMock
	};
});

vi.mock('$features/organization/index.server', async () => {
	const actual = await vi.importActual<typeof import('$features/organization/index.server')>(
		'$features/organization/index.server'
	);

	return {
		...actual,
		createSupabaseOrgSettingsMemberManagementPort: createSupabaseOrgSettingsMemberManagementPortMock,
		leaveOrganization: leaveOrganizationMock
	};
});

vi.mock('$features/training/index.server', () => ({
	fetchDashboardTrainingSummary: fetchDashboardTrainingSummaryMock
}));

vi.mock('$features/critical-tasks/index.server', () => ({
	fetchCriticalTasksDashboardSummary: fetchCriticalTasksDashboardSummaryMock
}));

vi.mock('./dashboardWorkspace.server', () => ({ streamDashboardWorkspaceBootstrap: streamDashboardWorkspaceMock }));

import { actions, load } from './+page.server';
import { RequestFailure } from '$lib/errors';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
function withLane(lane: keyof typeof mockCtx.auth.capabilityMap, level: 'none' | 'view') {
	return { ...mockCtx, auth: { ...mockCtx.auth, capabilityMap: { ...mockCtx.auth.capabilityMap, [lane]: level } } };
}

const easternViewer = { get: (name: string) => (name === 't2t_tz' ? 'America/New_York' : undefined) };

describe('dashboard page server load', () => {
	afterEach(() => vi.useRealTimers());
	beforeEach(() => {
		vi.clearAllMocks();
		buildLayoutRequestMock.mockResolvedValue({ auth: mockCtx.auth, audit: mockCtx.audit });
		createRequestDashboardSummaryContextMock.mockReturnValue(mockCtx);
		buildRouteRequestMock.mockResolvedValue({
			auth: { kind: 'auth' },
			audit: { kind: 'audit' }
		});
		createRequestNotificationContextMock.mockReturnValue({
			auth: { kind: 'auth' },
			audit: { kind: 'audit' },
			notifications: { kind: 'notifications' }
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
				lapsingAboveThresholdCount: 2,
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

	it('rejects suspended request admission before streaming dashboard reads', async () => {
		buildLayoutRequestMock.mockRejectedValueOnce({ status: 403, body: { message: 'Organization is suspended' } });
		await expect(
			load({
				params: { orgId: ORG_ID },
				locals: {},
				cookies: easternViewer,
				depends: vi.fn(),
				parent: () => {
					throw new Error('Must not run ancestors');
				}
			} as never)
		).rejects.toMatchObject({ status: 403, body: { message: 'Organization is suspended' } });
		expect(streamDashboardWorkspaceMock).not.toHaveBeenCalled();
	});

	it('streams dashboard summary without starting non-critical support queries in the page server load', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-15T02:00:00Z'));
		let resolveWorkspace: ((value: DashboardWorkspaceResult) => void) | undefined;
		const workspaceBootstrap = new Promise<DashboardWorkspaceResult>((resolve) => {
			resolveWorkspace = resolve;
		});
		const depends = vi.fn();
		streamDashboardWorkspaceMock.mockResolvedValueOnce({
			...createReadyAppShellRouteData({ orgId: ORG_ID, criticalTasksCapability: 'view' }),
			dashboard: {
				data: workspaceBootstrap
			}
		});

		const result = await load({
			params: { orgId: ORG_ID },
			locals: {},
			cookies: easternViewer,
			depends,
			parent: () => {
				throw new Error('Must not run ancestors');
			}
		} as never);

		expect(depends).toHaveBeenCalledWith('app:org-core');
		expect(depends).toHaveBeenCalledWith('app:dashboard-data', 'app:viewer-day');
		expect(result.breadcrumbLabel).toBe('Wednesday, Oct 14 2026');
		expect(result.viewerDay).toEqual({ date: '2026-10-14', timeZone: 'America/New_York' });
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
				personnel: [],
				groups: [],
				statusTypes: [],
				trainingTypes: [],
				lossWarningWindowDays: 180,
				strengthFloorPercent: 80
			} as unknown as DashboardWorkspaceData,
			hydration: { orgId: ORG_ID } as DashboardWorkspaceResult['hydration']
		});

		await expect(result.summary).resolves.toEqual({
			trainingSummary: { stats: null, issues: [] },
			onboardingTrainingCompletions: [],
			onboardingPersonnelIds: ['p2'],
			ictlSummary: {
				hasActiveTasks: true,
				overallReadinessPercent: 68,
				overallDeltaPercent: -4,
				readyCount: 17,
				applicableCount: 25,
				soldiersBelowThresholdCount: 3,
				soldiersAtRiskCount: 2,
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
		expect(fetchDashboardTrainingSummaryMock).toHaveBeenCalledWith(mockCtx, {
			personnel: [],
			trainingTypes: [],
			onboardingPersonnelIds: ['p2'],
			options: {
				issueLimit: 25,
				issueStatuses: ['expired', 'warning-orange']
			},
			asOf: '2026-10-14'
		});
		expect(fetchCriticalTasksDashboardSummaryMock).toHaveBeenCalledWith(mockCtx, {
			asOf: '2026-10-14',
			timeZone: 'America/New_York'
		});
	});

	it('does not fetch or return Critical Tasks dashboard data without Critical Tasks view access', async () => {
		let resolveWorkspace: ((value: DashboardWorkspaceResult) => void) | undefined;
		const workspaceBootstrap = new Promise<DashboardWorkspaceResult>((resolve) => {
			resolveWorkspace = resolve;
		});
		createRequestDashboardSummaryContextMock.mockReturnValue(withLane('criticalTasks', 'none'));
		streamDashboardWorkspaceMock.mockResolvedValueOnce({
			...createReadyAppShellRouteData({ orgId: ORG_ID, criticalTasksCapability: 'none' }),
			dashboard: {
				data: workspaceBootstrap
			}
		});

		const result = await load({
			params: { orgId: ORG_ID },
			locals: {},
			cookies: easternViewer,
			depends: vi.fn(),
			parent: () => {
				throw new Error('Must not run ancestors');
			}
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
				personnel: [],
				groups: [],
				statusTypes: [],
				trainingTypes: [],
				lossWarningWindowDays: 180,
				strengthFloorPercent: 80
			} as unknown as DashboardWorkspaceData,
			hydration: { orgId: ORG_ID } as DashboardWorkspaceResult['hydration']
		});

		await expect(result.summary).resolves.toEqual({
			trainingSummary: { stats: null, issues: [] },
			onboardingTrainingCompletions: [],
			onboardingPersonnelIds: [],
			ictlSummary: null
		});
		expect(fetchCriticalTasksDashboardSummaryMock).not.toHaveBeenCalled();
	});

	it('keeps the Dashboard available without fetching Training data when Training access is none', async () => {
		const shellData = createReadyAppShellRouteData({ orgId: ORG_ID, role: 'member', criticalTasksCapability: 'view' });
		const shell = requireReadyAppShell(shellData);
		shell.member.capabilityMap.training = 'none';
		shell.member.scopeSet = { kind: 'groups', groupIds: ['alpha'] };
		createRequestDashboardSummaryContextMock.mockReturnValue(withLane('training', 'none'));
		fetchDashboardTrainingSummaryMock.mockRejectedValue(new Error('You do not have permission to use training data'));
		streamDashboardWorkspaceMock.mockResolvedValueOnce({
			...shellData,
			dashboard: { data: Promise.resolve({ data: { personnel: [], trainingTypes: [], activeOnboardings: [] } }) }
		});

		const result = await load({
			params: { orgId: ORG_ID },
			locals: {},
			cookies: easternViewer,
			depends: vi.fn(),
			parent: () => {
				throw new Error('Must not run ancestors');
			}
		} as never);

		await expect(result.summary).resolves.toEqual({
			trainingSummary: null,
			onboardingTrainingCompletions: [],
			onboardingPersonnelIds: [],
			ictlSummary: expect.objectContaining({ hasActiveTasks: true })
		});
		expect(fetchDashboardTrainingSummaryMock).not.toHaveBeenCalled();
	});

	it('keeps packets out of the page summary for a Personnel and Training viewer without Onboarding', async () => {
		createRequestDashboardSummaryContextMock.mockReturnValue(withLane('onboarding', 'none'));
		fetchDashboardTrainingSummaryMock.mockResolvedValue({
			trainingSummary: { stats: null, issues: [] },
			onboardingTrainingCompletions: new Set(['p-cy-type-cpr'])
		});
		const packet = { id: 'packet-1', personnelId: 'p-cy' };
		streamDashboardWorkspaceMock.mockResolvedValueOnce({
			...createReadyAppShellRouteData({ orgId: ORG_ID }),
			dashboard: { data: Promise.resolve({ data: { personnel: [], trainingTypes: [], activeOnboardings: [packet] } }) }
		});

		const result = await load({
			params: { orgId: ORG_ID },
			locals: {},
			cookies: easternViewer,
			depends: vi.fn(),
			parent: () => {
				throw new Error('Must not run ancestors');
			}
		} as never);

		await expect(result.summary).resolves.toMatchObject({ onboardingPersonnelIds: [] });
		expect(fetchDashboardTrainingSummaryMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ onboardingPersonnelIds: [] })
		);
	});

	it('skips the Critical Tasks read an Organization switched off, though the viewer keeps the lane', async () => {
		createRequestDashboardSummaryContextMock.mockReturnValue({ ...mockCtx, disabledFeatures: ['criticalTasks'] });
		fetchCriticalTasksDashboardSummaryMock.mockRejectedValue(new Error('Critical Tasks read attempted'));
		streamDashboardWorkspaceMock.mockResolvedValueOnce({
			...createReadyAppShellRouteData({ orgId: ORG_ID }),
			dashboard: { data: Promise.resolve({ data: { personnel: [], trainingTypes: [], activeOnboardings: [] } }) }
		});

		const result = await load({
			params: { orgId: ORG_ID },
			locals: {},
			cookies: easternViewer,
			depends: vi.fn(),
			parent: () => {
				throw new Error('Must not run ancestors');
			}
		} as never);

		await expect(result.summary).resolves.toMatchObject({ ictlSummary: null });
		expect(fetchCriticalTasksDashboardSummaryMock).not.toHaveBeenCalled();
	});

	it('preserves Training failures when the member is allowed to view Training', async () => {
		fetchDashboardTrainingSummaryMock.mockRejectedValue(new Error('Training storage unavailable'));
		streamDashboardWorkspaceMock.mockResolvedValueOnce({
			...createReadyAppShellRouteData({ orgId: ORG_ID }),
			dashboard: { data: Promise.resolve({ data: { personnel: [], trainingTypes: [], activeOnboardings: [] } }) }
		});
		const result = await load({
			params: { orgId: ORG_ID },
			locals: {},
			cookies: easternViewer,
			depends: vi.fn(),
			parent: () => {
				throw new Error('Must not run ancestors');
			}
		} as never);
		await expect(result.summary).rejects.toThrow('Training storage unavailable');
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
				cookies: easternViewer,
				getClientAddress: () => '127.0.0.1'
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/dashboard?show=all'
		});
	});

	it('preserves an owner leave error as an HTTP bad request', async () => {
		leaveOrganizationMock.mockRejectedValue(
			new RequestFailure(400, 'Organization owners must transfer ownership before leaving the organization')
		);

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
				locals: { user: { id: 'user-1', email: 'user@example.com' }, supabase: {} },
				params: { orgId: ORG_ID },
				cookies: easternViewer,
				getClientAddress: () => '127.0.0.1'
			} as never)
		).rejects.toMatchObject({
			status: 400,
			body: { message: 'Organization owners must transfer ownership before leaving the organization' }
		});
	});
});

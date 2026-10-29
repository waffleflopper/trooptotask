import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import type { DashboardBootstrap } from '$features/dashboard/contracts';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { AssignmentType, AvailabilityEntry, StatusType, DailyAssignment } from '$features/calendar/contracts';
import type { TrainingType } from '$features/training/contracts';

const {
	fetchDashboardBootstrapMock,
	loadWithContextMock,
	createRequestDashboardWorkspaceContextMock,
	mockRequest,
	mockCtx
} = vi.hoisted(() => ({
	fetchDashboardBootstrapMock: vi.fn(),
	loadWithContextMock: vi.fn(),
	createRequestDashboardWorkspaceContextMock: vi.fn(),
	mockRequest: { auth: { orgId: '11111111-1111-1111-1111-111111111111' } },
	mockCtx: {
		auth: {
			userId: 'user-1',
			orgId: '11111111-1111-1111-1111-111111111111'
		},
		roster: { list: vi.fn() },
		groups: { listCatalog: vi.fn() }
	}
}));

vi.mock('$lib/server/adapters/requestContexts.server', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/requestContexts.server')>(
		'$lib/server/adapters/requestContexts.server'
	);
	return { ...actual, createRequestDashboardWorkspaceContext: createRequestDashboardWorkspaceContextMock };
});

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);
	return {
		...actual,
		loadWithContext: loadWithContextMock
	};
});

vi.mock('$features/dashboard/index.server', async () => {
	const actual = await vi.importActual<typeof import('$features/dashboard/index.server')>(
		'$features/dashboard/index.server'
	);
	return {
		...actual,
		fetchDashboardBootstrap: fetchDashboardBootstrapMock
	};
});

import { loadDashboardGroupStrengthOutline, streamDashboardWorkspaceBootstrap } from './dashboardWorkspace.server';
import { _createDashboardLayoutLoad } from './+layout.server';
import { createReadyAppShellRouteData, createUrlBlindLayoutEvent } from '../appShell.test-support';

describe('streamDashboardWorkspaceBootstrap', () => {
	const availabilityEntries = Promise.resolve([{ id: 'av1', personnelId: 'p1' } as AvailabilityEntry]);
	const todayAssignments = Promise.resolve([{ id: 'da1', date: '2026-05-01' } as DailyAssignment]);
	const dashboardData: DashboardBootstrap = {
		availabilityEntries,
		assignmentTypes: [{ id: 'at1', name: 'CQ' } as AssignmentType],
		todayAssignments,
		range: { rangeStart: '2026-04-30', rangeEnd: '2026-05-15' },
		pinnedGroups: ['Alpha'],
		ratingSchemeEntries: [],
		activeOnboardings: [],
		hasAnyOnboardingTemplate: true,
		personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
		groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group],
		statusTypes: [{ id: 'st1', name: 'Leave', color: '#ff0', textColor: '#000' } as StatusType],
		trainingTypes: [{ id: 'tt1', name: 'CPR' } as TrainingType],
		lossWarningWindowDays: 180,
		strengthFloorPercent: 80,
		trainingReadinessGoalPercent: 90,
		awardTrackingAcknowledgedPersonnelIds: [],
		specialDays: []
	};

	beforeEach(() => {
		vi.clearAllMocks();
		fetchDashboardBootstrapMock.mockResolvedValue(dashboardData);
		mockCtx.roster.list.mockResolvedValue([]);
		mockCtx.groups.listCatalog.mockResolvedValue([]);
		createRequestDashboardWorkspaceContextMock.mockReturnValue(mockCtx);
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = Promise.resolve().then(() => config.fn(config.context(mockRequest)));
			return config.defer ? Promise.resolve({ data }) : data;
		});
	});

	it('shares one workspace between independent layout and page consumers, then refreshes the next request', async () => {
		const { event } = createUrlBlindLayoutEvent<Parameters<ReturnType<typeof _createDashboardLayoutLoad>>[0]>(
			createReadyAppShellRouteData({ orgId: 'org-1' })
		);
		Object.assign(event.cookies, { getAll: () => [] });
		const [layout, pageWorkspace] = await Promise.all([
			_createDashboardLayoutLoad()(event),
			streamDashboardWorkspaceBootstrap({ locals: event.locals, cookies: event.cookies, orgId: 'org-1' })
		]);
		expect(layout && (await layout.dashboard.data)).toMatchObject({
			workspaceKey: 'dashboard',
			data: { lossWarningWindowDays: 180 },
			hydration: { orgId: '11111111-1111-1111-1111-111111111111' }
		});
		expect(await pageWorkspace.dashboard.data).toMatchObject({ data: { lossWarningWindowDays: 180 } });
		expect(fetchDashboardBootstrapMock).toHaveBeenCalledTimes(1);
		fetchDashboardBootstrapMock.mockResolvedValueOnce({ ...dashboardData, lossWarningWindowDays: 30 });
		const next = await streamDashboardWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: event.cookies,
			orgId: 'org-1'
		});
		expect(await next.dashboard.data).toMatchObject({ data: { lossWarningWindowDays: 30 } });
	});

	it('streams an App Shell-adjacent Dashboard workspace result with explicit Dashboard hydration targets', async () => {
		const routeData = await streamDashboardWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: { getAll: () => [{ name: 't2t-confirmed-tab1', value: '7' }] } as unknown as Cookies,
			orgId: 'route-segment'
		});

		const workspace = await routeData.dashboard.data;

		expect(workspace).toEqual({
			workspaceKey: 'dashboard',
			data: dashboardData,
			hydration: {
				orgId: '11111111-1111-1111-1111-111111111111',
				confirmedChangesByTab: { tab1: 7 },
				personnel: {
					mode: 'replace',
					deferred: false,
					snapshotKey: expect.any(String),
					items: dashboardData.personnel
				},
				groups: {
					mode: 'replace',
					deferred: false,
					snapshotKey: expect.any(String),
					items: dashboardData.groups
				},
				statusTypes: {
					mode: 'replace',
					deferred: false,
					snapshotKey: expect.any(String),
					items: dashboardData.statusTypes
				},
				availabilityEntries: {
					mode: 'range',
					deferred: true,
					snapshotKey: expect.any(String),
					items: availabilityEntries,
					range: { rangeStart: '2026-04-30', rangeEnd: '2026-05-15' }
				},
				calendarAssignments: expect.objectContaining({
					mode: 'range',
					deferred: true,
					snapshotKey: expect.any(String),
					items: expect.any(Promise),
					range: { rangeStart: '2026-04-30', rangeEnd: '2026-05-15' }
				}),
				trainingTypes: {
					mode: 'replace',
					deferred: false,
					snapshotKey: expect.any(String),
					items: dashboardData.trainingTypes
				},
				pinnedGroups: {
					mode: 'replace',
					deferred: false,
					snapshotKey: expect.any(String),
					items: dashboardData.pinnedGroups
				}
			}
		});
		await expect(workspace.hydration.calendarAssignments.items).resolves.toEqual({
			types: dashboardData.assignmentTypes,
			assignments: [{ id: 'da1', date: '2026-05-01' }]
		});
		expect(workspace.hydration.personnel.snapshotKey).toMatch(/^resolved:/);
		expect(workspace.hydration.personnel.snapshotKey).not.toContain('John');
	});

	it('keeps resolved snapshot keys stable for the same content without exposing item values', async () => {
		const firstRouteData = await streamDashboardWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: { getAll: () => [{ name: 't2t-confirmed-tab1', value: '7' }] } as unknown as Cookies,
			orgId: 'route-segment'
		});
		const firstWorkspace = await firstRouteData.dashboard.data;

		fetchDashboardBootstrapMock.mockResolvedValue({
			...dashboardData,
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel]
		});

		const secondRouteData = await streamDashboardWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: { getAll: () => [{ name: 't2t-confirmed-tab1', value: '7' }] } as unknown as Cookies,
			orgId: 'route-segment'
		});
		const secondWorkspace = await secondRouteData.dashboard.data;

		expect(secondWorkspace.hydration.personnel.snapshotKey).toBe(firstWorkspace.hydration.personnel.snapshotKey);
		expect(secondWorkspace.hydration.personnel.snapshotKey).not.toContain('John');

		fetchDashboardBootstrapMock.mockResolvedValue({
			...dashboardData,
			personnel: [{ id: 'p2', firstName: 'Jane', lastName: 'Doe' } as Personnel]
		});

		const changedRouteData = await streamDashboardWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: { getAll: () => [{ name: 't2t-confirmed-tab1', value: '7' }] } as unknown as Cookies,
			orgId: 'route-segment'
		});
		const changedWorkspace = await changedRouteData.dashboard.data;

		expect(changedWorkspace.hydration.personnel.snapshotKey).not.toBe(firstWorkspace.hydration.personnel.snapshotKey);
		expect(changedWorkspace.hydration.personnel.snapshotKey).not.toContain('Jane');
	});
	it("outlines the nested by-group rows from the workspace's own roster reads", async () => {
		const groups: Group[] = [
			{ id: 'plt', name: '2nd Platoon', sortOrder: 0, parentId: null, depth: 1 },
			{ id: 'sqd', name: '1st Squad', sortOrder: 0, parentId: 'plt', depth: 2 },
			{ id: 'alpha', name: 'Alpha', sortOrder: 1, parentId: null, depth: 1 }
		];
		const personnel = [
			{ id: 'p1', groupId: 'plt' },
			{ id: 'p2', groupId: 'sqd' },
			{ id: 'p3', groupId: 'alpha' }
		] as Personnel[];
		mockCtx.groups.listCatalog.mockResolvedValue(groups);
		mockCtx.roster.list.mockResolvedValue(personnel);
		const context = { locals: {} as App.Locals, cookies: { getAll: () => [] } as unknown as Cookies, orgId: 'org-1' };

		const [route, outline] = await Promise.all([
			streamDashboardWorkspaceBootstrap(context),
			loadDashboardGroupStrengthOutline(context)
		]);

		expect(outline).toEqual({ rows: 4, folded: false });
		await route.dashboard.data;
		expect(await fetchDashboardBootstrapMock.mock.calls[0][1].personnel).toBe(personnel);
	});

	it('keeps the compact skeleton when the roster read fails', async () => {
		mockCtx.groups.listCatalog.mockRejectedValue(new Error('groups unavailable'));
		const context = { locals: {} as App.Locals, cookies: { getAll: () => [] } as unknown as Cookies, orgId: 'org-1' };

		expect(await loadDashboardGroupStrengthOutline(context)).toBeNull();
	});
});

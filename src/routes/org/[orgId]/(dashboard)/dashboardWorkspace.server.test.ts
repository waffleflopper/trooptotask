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
		}
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

import { streamDashboardWorkspaceBootstrap } from './dashboardWorkspace.server';

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
		awardTrackingAcknowledgedPersonnelIds: [],
		specialDays: []
	};

	beforeEach(() => {
		vi.clearAllMocks();
		fetchDashboardBootstrapMock.mockResolvedValue(dashboardData);
		createRequestDashboardWorkspaceContextMock.mockReturnValue(mockCtx);
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = Promise.resolve().then(() => config.fn(config.context(mockRequest)));
			return config.defer ? Promise.resolve({ data }) : data;
		});
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
});

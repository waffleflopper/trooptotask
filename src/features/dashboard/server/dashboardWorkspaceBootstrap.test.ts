import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';
import type { Group } from '$lib/stores/groups.svelte';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, StatusType } from '$lib/types';
import type { TrainingType } from '$features/training/training.types';

const { fetchDashboardBootstrapMock, loadWithContextMock, mockCtx } = vi.hoisted(() => ({
	fetchDashboardBootstrapMock: vi.fn(),
	loadWithContextMock: vi.fn(),
	mockCtx: {
		auth: {
			userId: 'user-1',
			orgId: '11111111-1111-1111-1111-111111111111'
		}
	}
}));

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);
	return {
		...actual,
		loadWithContext: loadWithContextMock
	};
});

vi.mock('$lib/server/core/useCases/dashboardQuery', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/dashboardQuery')>(
		'$lib/server/core/useCases/dashboardQuery'
	);
	return {
		...actual,
		fetchDashboardBootstrap: fetchDashboardBootstrapMock
	};
});

import { streamDashboardWorkspaceBootstrap } from './dashboardWorkspaceBootstrap';

describe('streamDashboardWorkspaceBootstrap', () => {
	const availabilityEntries = Promise.resolve([{ id: 'av1', personnelId: 'p1' } as AvailabilityEntry]);
	const todayAssignments = Promise.resolve([{ id: 'da1', date: '2026-05-01' } as DailyAssignment]);
	const dashboardData: DashboardBootstrap = {
		availabilityEntries,
		assignmentTypes: [{ id: 'at1', name: 'CQ' } as AssignmentType],
		todayAssignments,
		pinnedGroups: ['Alpha'],
		ratingSchemeEntries: [],
		activeOnboardings: [],
		todayDutyEvents: [],
		personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
		groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group],
		statusTypes: [{ id: 'st1', name: 'Leave', color: '#ff0', textColor: '#000' } as StatusType],
		trainingTypes: [{ id: 'tt1', name: 'CPR' } as TrainingType],
		lossWarningWindowDays: 180,
		awardTrackingAcknowledgedPersonnelIds: []
	};

	beforeEach(() => {
		vi.clearAllMocks();
		fetchDashboardBootstrapMock.mockResolvedValue(dashboardData);
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = Promise.resolve(config.fn(mockCtx as never));
			return config.defer ? Promise.resolve({ data }) : data;
		});
	});

	it('streams an App Shell-adjacent Dashboard workspace result with explicit Dashboard hydration targets', async () => {
		const routeData = await streamDashboardWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: {} as Cookies,
			orgId: 'route-segment'
		});

		const workspace = await routeData.dashboard.data;

		expect(loadWithContextMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'route-segment',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
				defer: true,
				fn: expect.any(Function)
			})
		);
		expect(loadWithContextMock.mock.calls[0]?.[3]).not.toHaveProperty('permission');
		expect(loadWithContextMock.mock.calls[0]?.[3]).not.toHaveProperty('policyResource');
		expect(fetchDashboardBootstrapMock).toHaveBeenCalledWith(mockCtx);
		expect(workspace).toEqual({
			workspaceKey: 'dashboard',
			data: dashboardData,
			hydration: {
				orgId: '11111111-1111-1111-1111-111111111111',
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
					mode: 'replace',
					deferred: true,
					snapshotKey: expect.any(String),
					items: availabilityEntries
				},
				calendarAssignments: expect.objectContaining({
					mode: 'replace',
					deferred: true,
					snapshotKey: expect.any(String),
					items: expect.any(Promise)
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
			cookies: {} as Cookies,
			orgId: 'route-segment'
		});
		const firstWorkspace = await firstRouteData.dashboard.data;

		fetchDashboardBootstrapMock.mockResolvedValue({
			...dashboardData,
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel]
		});

		const secondRouteData = await streamDashboardWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: {} as Cookies,
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
			cookies: {} as Cookies,
			orgId: 'route-segment'
		});
		const changedWorkspace = await changedRouteData.dashboard.data;

		expect(changedWorkspace.hydration.personnel.snapshotKey).not.toBe(firstWorkspace.hydration.personnel.snapshotKey);
		expect(changedWorkspace.hydration.personnel.snapshotKey).not.toContain('Jane');
	});
});

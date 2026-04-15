import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { createInMemoryOrgWorkspacePort } from '$lib/server/adapters/inMemoryOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { TrainingType } from '$features/training/training.types';
import type { WorkspaceBootstrap, WorkspaceKey } from '$lib/server/core/orgShell';
import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';
import { _createDashboardLayoutLoad } from './+layout.server';

describe('dashboard layout server load', () => {
	it('registers dashboard dependencies and streams deferred dashboard hydration targets', async () => {
		const availabilityEntries = Promise.resolve([
			{
				id: 'av1',
				personnelId: 'p1',
				statusTypeId: 'st1',
				startDate: '2024-01-01',
				endDate: '2024-01-01',
				note: null
			} satisfies AvailabilityEntry
		]);
		const todayAssignments = Promise.resolve([
			{
				id: 'da1',
				date: '2024-01-15',
				assignmentTypeId: 'at1',
				assigneeId: 'p1'
			} satisfies DailyAssignment
		]);
		const dashboardData = {
			availabilityEntries,
			assignmentTypes: [
				{
					id: 'at1',
					name: 'CQ',
					shortName: 'CQ',
					assignTo: 'personnel',
					color: '#ef4444',
					exemptPersonnelIds: [],
					showInDateHeader: false
				} satisfies AssignmentType
			],
			todayAssignments,
			pinnedGroups: ['Alpha'],
			ratingSchemeEntries: [],
			activeOnboardings: [],
			todayDutyEvents: [],
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group],
			statusTypes: [{ id: 'st1', name: 'Leave', color: '#ff0', textColor: '#000' } as StatusType],
			trainingTypes: [{ id: 'tt1', name: 'CPR' } as TrainingType],
			lossWarningWindowDays: 180
		} as DashboardBootstrap;
		const depends = vi.fn();
		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([['dashboard', dashboardData]])
		);
		const plannerPort = createDefaultHydrationPlanner('org-1');
		const createWorkspacePort = vi.fn().mockReturnValue(workspacePort);
		const createPlannerPort = vi.fn().mockReturnValue(plannerPort);
		const load = _createDashboardLayoutLoad({
			createWorkspacePort,
			createPlannerPort
		});
		const locals = {} as App.Locals;
		const cookies = {} as Cookies;

		const result = await load({
			params: { orgId: 'org-1' },
			locals,
			cookies,
			depends
		} as unknown as Parameters<typeof load>[0]);
		if (!result) {
			throw new Error('Expected dashboard layout load to return data');
		}

		expect(depends).toHaveBeenCalledTimes(1);
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:dashboard-data');
		expect(createWorkspacePort).toHaveBeenCalledWith({ locals, cookies, orgId: 'org-1' });
		expect(createPlannerPort).toHaveBeenCalledWith('org-1');
		expect(result.dashboard.data).toBeInstanceOf(Promise);

		await expect(result.dashboard.data).resolves.toEqual({
			workspace: 'dashboard',
			data: dashboardData,
			hydration: expect.objectContaining({
				orgId: 'org-1',
				availabilityEntries: {
					mode: 'replace',
					deferred: true,
					items: availabilityEntries,
					snapshotKey: expect.any(String)
				},
				calendarAssignments: {
					mode: 'replace',
					deferred: true,
					items: expect.any(Promise),
					snapshotKey: expect.any(String)
				}
			})
		} satisfies WorkspaceBootstrap<DashboardBootstrap>);
	});
});

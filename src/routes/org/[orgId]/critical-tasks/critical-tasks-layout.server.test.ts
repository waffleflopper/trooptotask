import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { createInMemoryOrgWorkspacePort } from '$lib/server/adapters/inMemoryOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { Group } from '$lib/stores/groups.svelte';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { Personnel } from '$lib/types';
import type { WorkspaceBootstrap, WorkspaceKey } from '$lib/server/core/orgShell';
import type { CriticalTasksBootstrap } from '$lib/server/core/useCases/criticalTasksQuery';
import { _createCriticalTasksLayoutLoad } from './+layout.server';

describe('critical tasks layout server load', () => {
	it('registers Critical Tasks dependencies and streams the canonical workspace payload', async () => {
		const personnelIctCompletions = Promise.resolve([
			{
				id: 'ictc1',
				personnelId: 'p1',
				ictTaskId: 'task1',
				completedAt: '2026-04-01',
				validationMethod: 'Lecture',
				validatedBy: null,
				notes: null,
				loggedBy: 'user-1',
				createdAt: '2026-04-01T12:00:00Z'
			} satisfies PersonnelIctCompletion
		]);
		const criticalTasksData: CriticalTasksBootstrap = {
			personnelIctCompletions,
			ictTasks: [
				{
					id: 'task1',
					taskCode: '181-105-1001',
					title: 'Perform tactical combat casualty care',
					mos: ['68W'],
					expirationMonths: 12,
					archivedAt: null,
					createdAt: '2026-04-01T12:00:00Z'
				} satisfies IctTask
			],
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group]
		};
		const depends = vi.fn();
		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([['critical-tasks', criticalTasksData]])
		);
		const plannerPort = createDefaultHydrationPlanner('org-1');
		const createWorkspacePort = vi.fn().mockReturnValue(workspacePort);
		const createPlannerPort = vi.fn().mockReturnValue(plannerPort);
		const load = _createCriticalTasksLayoutLoad({
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
			throw new Error('Expected critical tasks layout load to return data');
		}

		expect(depends).toHaveBeenCalledTimes(1);
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:critical-tasks-data');
		expect(createWorkspacePort).toHaveBeenCalledWith({ locals, cookies, orgId: 'org-1' });
		expect(createPlannerPort).toHaveBeenCalledWith('org-1');
		expect(result.criticalTasks.data).toBeInstanceOf(Promise);

		await expect(result.criticalTasks.data).resolves.toMatchObject({
			workspace: 'critical-tasks',
			data: criticalTasksData,
			hydration: {
				orgId: 'org-1',
				ictTasks: expect.objectContaining({
					mode: 'replace',
					items: criticalTasksData.ictTasks,
					deferred: false,
					snapshotKey: expect.any(String)
				}),
				personnelIctCompletions: expect.objectContaining({
					mode: 'replace',
					items: personnelIctCompletions,
					deferred: true,
					snapshotKey: expect.any(String)
				})
			}
		} satisfies WorkspaceBootstrap<CriticalTasksBootstrap>);
	});
});

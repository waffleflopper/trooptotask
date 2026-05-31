import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { createInMemoryOrgWorkspacePort } from '$lib/server/adapters/inMemoryOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { Group } from '$lib/stores/groups.svelte';
import type { PersonnelTraining, TrainingType, TrainingView } from '$features/training/training.types';
import type { Personnel } from '$lib/types';
import type { WorkspaceBootstrap, WorkspaceKey } from '$lib/server/core/orgShell';
import type { TrainingBootstrap } from '$lib/server/core/orgShell';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';
import { _createTrainingLayoutLoad } from './+layout.server';

describe('training layout server load', () => {
	it('registers training dependencies and streams the canonical training workspace payload', async () => {
		const personnelTrainings = Promise.resolve([
			{
				id: 'pt1',
				personnelId: 'p1',
				trainingTypeId: 'tt1',
				completionDate: null,
				expirationDate: null,
				notes: null,
				certificateUrl: null
			} satisfies PersonnelTraining
		]);
		const trainingData: TrainingBootstrap = {
			personnelTrainings,
			trainingTypes: [{ id: 'tt1', name: 'CPR' } as TrainingType],
			trainingViews: [
				{
					id: 'tv1',
					name: 'All Personnel',
					columnIds: [],
					createdBy: 'u1',
					createdAt: '2024-01-01',
					updatedAt: '2024-01-01'
				} as TrainingView
			],
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group],
			pinnedGroups: ['Alpha']
		};
		const depends = vi.fn();
		const workspacePort = createInMemoryOrgWorkspacePort(new Map<WorkspaceKey, unknown>([['training', trainingData]]));
		const plannerPort = createDefaultHydrationPlanner('org-1');
		const createWorkspacePort = vi.fn().mockReturnValue(workspacePort);
		const createPlannerPort = vi.fn().mockReturnValue(plannerPort);
		const load = _createTrainingLayoutLoad({
			createWorkspacePort,
			createPlannerPort
		});
		const locals = {} as App.Locals;
		const cookies = {} as Cookies;
		const parent = vi.fn().mockResolvedValue(createReadyAppShellRouteData({ orgId: 'org-1' }));

		const result = await load({
			params: { orgId: '1-11-bde' },
			locals,
			cookies,
			depends,
			parent
		} as unknown as Parameters<typeof load>[0]);
		if (!result) {
			throw new Error('Expected training layout load to return data');
		}

		expect(depends).toHaveBeenCalledTimes(1);
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:training-data');
		expect(parent).toHaveBeenCalledTimes(1);
		expect(createWorkspacePort).toHaveBeenCalledWith({ locals, cookies, orgId: 'org-1' });
		expect(createPlannerPort).toHaveBeenCalledWith('org-1');
		expect(result.training.data).toBeInstanceOf(Promise);

		await expect(result.training.data).resolves.toMatchObject({
			workspace: 'training',
			data: trainingData,
			hydration: {
				orgId: 'org-1',
				personnelTrainings: expect.objectContaining({
					mode: 'replace',
					items: personnelTrainings,
					deferred: true,
					snapshotKey: expect.any(String)
				})
			}
		} satisfies WorkspaceBootstrap<TrainingBootstrap>);
	});
});

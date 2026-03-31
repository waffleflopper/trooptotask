import { describe, expect, it } from 'vitest';
import { createInMemoryOrgWorkspacePort } from '$lib/server/adapters/inMemoryOrgShell';
import type { WorkspaceKey, WorkspaceBootstrap } from '../orgShell';
import type { TrainingBootstrap } from './trainingQuery';
import type { PersonnelTraining, TrainingType, TrainingView } from '$features/training/training.types';
import type { Personnel } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import { loadOrgWorkspaceRouteData } from './loadOrgWorkspaceRouteData';
import { createDefaultHydrationPlanner } from '../hydrationPlanner';

describe('loadOrgWorkspaceRouteData', () => {
	it('returns the canonical training route payload with deferred personnelTrainings hydration', async () => {
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

		const workspacePort = createInMemoryOrgWorkspacePort(new Map<WorkspaceKey, unknown>([['training', trainingData]]));
		const plannerPort = createDefaultHydrationPlanner('org-1');

		const result = await loadOrgWorkspaceRouteData('training', workspacePort, plannerPort);

		expect(result).toEqual({
			training: {
				workspace: 'training',
				data: trainingData,
				hydration: expect.objectContaining({
					orgId: 'org-1',
					groups: {
						mode: 'replace',
						items: trainingData.groups,
						snapshotKey: expect.any(String)
					},
					personnel: {
						scoped: {
							mode: 'replace',
							items: trainingData.personnel,
							snapshotKey: expect.any(String)
						}
					},
					trainingTypes: {
						mode: 'replace',
						items: trainingData.trainingTypes,
						snapshotKey: expect.any(String)
					},
					trainingViews: {
						mode: 'replace',
						items: trainingData.trainingViews,
						snapshotKey: expect.any(String)
					},
					personnelTrainings: {
						mode: 'replace',
						items: personnelTrainings,
						snapshotKey: expect.any(String)
					}
				})
			} satisfies WorkspaceBootstrap<TrainingBootstrap>
		});
	});
});

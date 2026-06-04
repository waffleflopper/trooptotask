import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import type { Group } from '$lib/stores/groups.svelte';
import type { PersonnelTraining, TrainingType, TrainingView } from '$features/training/training.types';
import type { Personnel } from '$lib/types';
import type { TrainingWorkspaceRouteData } from '$features/training/server/trainingWorkspaceBootstrap';
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
		const trainingData = {
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
		const streamTrainingWorkspace = vi.fn().mockResolvedValue({
			training: {
				data: Promise.resolve({
					laneKey: 'training',
					data: trainingData,
					hydration: {
						orgId: 'org-1',
						personnel: { mode: 'replace', items: trainingData.personnel, snapshotKey: 'personnel:1' },
						groups: { mode: 'replace', items: trainingData.groups, snapshotKey: 'groups:1' },
						trainingTypes: { mode: 'replace', items: trainingData.trainingTypes, snapshotKey: 'types:1' },
						trainingViews: { mode: 'replace', items: trainingData.trainingViews, snapshotKey: 'views:1' },
						personnelTrainings: {
							mode: 'replace',
							items: personnelTrainings,
							deferred: true,
							snapshotKey: 'personnel-trainings:1'
						},
						pinnedGroups: { mode: 'replace', items: trainingData.pinnedGroups, snapshotKey: 'pinned:1' }
					}
				})
			}
		} satisfies TrainingWorkspaceRouteData);
		const load = _createTrainingLayoutLoad({
			streamTrainingWorkspace
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
		expect(streamTrainingWorkspace).toHaveBeenCalledWith({ locals, cookies, orgId: 'org-1' });
		expect(result.training.data).toBeInstanceOf(Promise);

		await expect(result.training.data).resolves.toMatchObject({
			laneKey: 'training',
			data: trainingData,
			hydration: {
				orgId: 'org-1',
				personnelTrainings: expect.objectContaining({
					mode: 'replace',
					items: personnelTrainings,
					deferred: true,
					snapshotKey: 'personnel-trainings:1'
				})
			}
		});
	});
});

import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { createInMemoryOrgWorkspacePort } from '$lib/server/adapters/inMemoryOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { Group } from '$lib/stores/groups.svelte';
import type { WorkspaceBootstrap, WorkspaceKey } from '$lib/server/core/orgShell';
import type { PersonnelBootstrap } from '$lib/server/core/useCases/personnelWorkspaceQuery';
import type { Personnel, PersonnelLookup, StatusType } from '$lib/types';
import { _createPersonnelLayoutLoad } from './+layout.server';

describe('personnel layout server load', () => {
	it('registers personnel dependencies and preserves the canonical personnel workspace payload', async () => {
		const personnelData: PersonnelBootstrap = {
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			personnelLookup: [
				{ id: 'p1', rank: 'SGT', firstName: 'John', lastName: 'Smith' } as PersonnelLookup,
				{ id: 'p2', rank: 'CPT', firstName: 'Jane', lastName: 'Jones' } as PersonnelLookup
			],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group],
			statusTypes: [{ id: 'st1', name: 'Leave', color: '#ff0', textColor: '#000' } as StatusType],
			pinnedGroups: ['Alpha'],
			lossWarningWindowDays: 180,
			awardTrackingAcknowledgedPersonnelIds: []
		};
		const depends = vi.fn();
		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([['personnel', personnelData]])
		);
		const plannerPort = createDefaultHydrationPlanner('org-1');
		const createWorkspacePort = vi.fn().mockReturnValue(workspacePort);
		const createPlannerPort = vi.fn().mockReturnValue(plannerPort);
		const load = _createPersonnelLayoutLoad({
			createWorkspacePort,
			createPlannerPort
		});
		const locals = {} as App.Locals;
		const cookies = {} as Cookies;

		const result = await load({
			params: { orgId: 'org-1' },
			locals,
			cookies,
			depends,
			url: new URL('https://example.test/org/org-1/personnel')
		} as unknown as Parameters<typeof load>[0]);

		expect(depends).toHaveBeenCalledTimes(1);
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:personnel-data');
		expect(createWorkspacePort).toHaveBeenCalledWith({ locals, cookies, orgId: 'org-1' });
		expect(createPlannerPort).toHaveBeenCalledWith('org-1');
		expect(result).toMatchObject({
			personnel: {
				workspace: 'personnel',
				data: personnelData,
				hydration: {
					orgId: 'org-1',
					personnel: {
						scoped: expect.objectContaining({
							mode: 'replace',
							items: personnelData.personnel,
							deferred: false,
							snapshotKey: expect.any(String)
						})
					},
					groups: expect.objectContaining({
						mode: 'replace',
						items: personnelData.groups,
						deferred: false,
						snapshotKey: expect.any(String)
					}),
					statusTypes: expect.objectContaining({
						mode: 'replace',
						items: personnelData.statusTypes,
						deferred: false,
						snapshotKey: expect.any(String)
					}),
					pinnedGroups: expect.objectContaining({
						mode: 'replace',
						items: personnelData.pinnedGroups,
						deferred: false,
						snapshotKey: expect.any(String)
					})
				}
			} satisfies WorkspaceBootstrap<PersonnelBootstrap>
		});
	});
});

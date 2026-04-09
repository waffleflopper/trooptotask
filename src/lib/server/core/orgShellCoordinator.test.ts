import { describe, expect, it } from 'vitest';
import {
	createInMemoryOrgAccessPort,
	createInMemoryOrgChromePort,
	createInMemoryOrgWorkspacePort
} from '$lib/server/adapters/inMemoryOrgShell';
import { createDefaultHydrationPlanner } from './hydrationPlanner';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import type { Group } from '$lib/stores/groups.svelte';
import type { PersonnelTraining, TrainingType, TrainingView } from '$features/training/training.types';
import type { Personnel } from '$lib/types';
import type { ChromeData, MembershipInfo, OrgState, WorkspaceBootstrap, WorkspaceKey } from './orgShell';
import { createOrgShellCoordinator } from './orgShellCoordinator';
import type { TrainingBootstrap } from './useCases/trainingQuery';

const membership: MembershipInfo = {
	orgId: 'org-1',
	userId: 'user-1',
	role: 'member',
	permissions: {
		canViewCalendar: true,
		canEditCalendar: false,
		canViewPersonnel: true,
		canEditPersonnel: false,
		canViewTraining: true,
		canEditTraining: false,
		canViewOnboarding: false,
		canEditOnboarding: false,
		canViewLeadersBook: false,
		canEditLeadersBook: false,
		canManageMembers: false
	},
	scopedGroupId: null
};

const orgState: OrgState = {
	orgName: 'Test Unit',
	isDemoReadOnly: false,
	isDemoSandbox: false,
	effectiveTier: {
		tier: 'free',
		source: 'default',
		personnelCount: 0,
		personnelCap: 20,
		isReadOnly: false,
		giftExpiresAt: null,
		giftTier: null
	}
};

const chrome: ChromeData = {
	unreadNotificationCount: 3,
	activeAnnouncements: [{ id: 'a1', title: 'Heads up', message: 'Check this', type: 'info' }],
	allOrgs: [{ id: 'org-1', name: 'Test Unit', role: 'member' }],
	userPreferences: getDefaultUserOrgPreferences()
};

describe('OrgShellCoordinator', () => {
	it('loads the canonical root org shell payload for the authenticated happy path', async () => {
		const coordinator = createOrgShellCoordinator();

		const result = await coordinator.loadRoot({
			kind: 'shell',
			access: createInMemoryOrgAccessPort({ membership, orgState }),
			chrome: createInMemoryOrgChromePort({ chrome })
		});

		expect(result).toMatchObject({
			orgId: 'org-1',
			orgName: 'Test Unit',
			userId: 'user-1',
			userPreferences: chrome.userPreferences,
			userRole: 'member',
			permissions: membership.permissions,
			scopedGroupId: null,
			isOwner: false,
			isAdmin: false,
			isFullEditor: false,
			effectiveTier: orgState.effectiveTier,
			unreadNotificationCount: 3,
			activeAnnouncements: chrome.activeAnnouncements,
			allOrgs: chrome.allOrgs,
			isDemoReadOnly: false,
			isDemoSandbox: false,
			shell: {
				orgId: 'org-1',
				orgName: 'Test Unit',
				userId: 'user-1',
				userPreferences: chrome.userPreferences,
				userRole: 'member',
				permissions: membership.permissions,
				scopedGroupId: null,
				isOwner: false,
				isAdmin: false,
				isFullEditor: false,
				effectiveTier: orgState.effectiveTier,
				unreadNotificationCount: 3,
				activeAnnouncements: chrome.activeAnnouncements,
				allOrgs: chrome.allOrgs,
				isDemoReadOnly: false,
				isDemoSandbox: false
			}
		});
	});

	it('returns the suspended root-shell payload through the coordinator boundary', async () => {
		const coordinator = createOrgShellCoordinator();

		const result = await coordinator.loadRoot({
			kind: 'suspended',
			orgId: 'org-1',
			orgName: 'Test Unit'
		});

		expect(result).toEqual({
			orgSuspended: true,
			orgId: 'org-1',
			orgName: 'Test Unit'
		});
	});

	it('preserves the deprecated demo read-only path through the coordinator boundary', async () => {
		const coordinator = createOrgShellCoordinator();

		const result = await coordinator.loadRoot({
			kind: 'shell',
			access: createInMemoryOrgAccessPort({
				membership: { ...membership, userId: null },
				orgState: { ...orgState, isDemoReadOnly: true }
			}),
			chrome: createInMemoryOrgChromePort({
				chrome: {
					...chrome,
					unreadNotificationCount: 0,
					allOrgs: []
				}
			})
		});

		expect(result).toMatchObject({
			orgId: 'org-1',
			orgName: 'Test Unit',
			userId: null,
			userRole: 'member',
			isDemoReadOnly: true,
			isDemoSandbox: false
		});
	});

	it('preserves the deprecated demo sandbox path through the coordinator boundary', async () => {
		const coordinator = createOrgShellCoordinator();

		const result = await coordinator.loadRoot({
			kind: 'shell',
			access: createInMemoryOrgAccessPort({
				membership: {
					...membership,
					userId: null,
					role: 'owner',
					permissions: {
						canViewCalendar: true,
						canEditCalendar: true,
						canViewPersonnel: true,
						canEditPersonnel: true,
						canViewTraining: true,
						canEditTraining: true,
						canViewOnboarding: true,
						canEditOnboarding: true,
						canViewLeadersBook: true,
						canEditLeadersBook: true,
						canManageMembers: true
					}
				},
				orgState: { ...orgState, isDemoSandbox: true }
			}),
			chrome: createInMemoryOrgChromePort({
				chrome: {
					...chrome,
					unreadNotificationCount: 0,
					allOrgs: []
				}
			})
		});

		expect(result).toMatchObject({
			orgId: 'org-1',
			orgName: 'Test Unit',
			userId: null,
			userRole: 'owner',
			isOwner: true,
			isDemoReadOnly: false,
			isDemoSandbox: true
		});
	});

	it('returns the canonical training workspace payload with deferred personnelTrainings hydration', async () => {
		const coordinator = createOrgShellCoordinator();
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
		const planner = createDefaultHydrationPlanner('org-1');

		const result = await coordinator.loadWorkspace<TrainingBootstrap, 'training'>('training', {
			workspace: workspacePort,
			planner
		});

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
					},
					pinnedGroups: {
						mode: 'replace',
						items: trainingData.pinnedGroups,
						snapshotKey: expect.any(String)
					}
				})
			} satisfies WorkspaceBootstrap<TrainingBootstrap>
		});
	});

	it('omits workspace hydration when the planner returns no plan', async () => {
		const coordinator = createOrgShellCoordinator();
		const trainingData: TrainingBootstrap = {
			personnelTrainings: Promise.resolve([]),
			trainingTypes: [],
			trainingViews: [],
			personnel: [],
			groups: [],
			pinnedGroups: []
		};
		const workspacePort = createInMemoryOrgWorkspacePort(new Map<WorkspaceKey, unknown>([['training', trainingData]]));

		const result = await coordinator.loadWorkspace<TrainingBootstrap, 'training'>('training', {
			workspace: workspacePort,
			planner: {
				createPlan: () => undefined
			}
		});

		expect(result).toEqual({
			training: {
				workspace: 'training',
				data: trainingData
			} satisfies WorkspaceBootstrap<TrainingBootstrap>
		});
	});
});

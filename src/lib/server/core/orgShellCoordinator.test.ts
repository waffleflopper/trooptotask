import { describe, expect, it } from 'vitest';
import { defineStore } from '$lib/stores/core';
import {
	createInMemoryOrgAccessPort,
	createInMemoryOrgChromePort,
	createInMemoryOrgWorkspacePort
} from '$lib/server/adapters/inMemoryOrgShell';
import type { HydrationStores } from '$lib/orgShellHydrationCoordinator.svelte';
import { createDefaultHydrationPlanner } from './hydrationPlanner';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import type { Group } from '$lib/stores/groups.svelte';
import type { PersonnelTraining, TrainingType, TrainingView } from '$features/training/training.types';
import type { AssignmentType, DailyAssignment, Personnel } from '$lib/types';
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

function createNoopLoadable<T>() {
	return {
		orgId: '',
		load(_items: T[], orgId: string) {
			this.orgId = orgId;
		}
	};
}

function createNoopCalendarAssignmentsStore() {
	return {
		orgId: '',
		loading: false,
		types: [] as unknown[],
		assignments: [] as unknown[],
		load(types: unknown[], assignments: unknown[], orgId: string) {
			this.orgId = orgId;
			this.loading = false;
			this.types = types;
			this.assignments = assignments;
		},
		startLoading() {
			this.loading = true;
		}
	};
}

function createNoopOnboardingTemplatesStore() {
	return {
		orgId: '',
		load(_templates: unknown[], _steps: unknown[], orgId: string) {
			this.orgId = orgId;
		}
	};
}

function createHydrationStores() {
	const personnelTrainings = defineStore<PersonnelTraining>({ table: 'personnel_trainings' });
	const calendarAssignments = createNoopCalendarAssignmentsStore();

	return {
		stores: {
			personnelStore: createNoopLoadable<Personnel>() as HydrationStores['personnelStore'],
			groupsStore: createNoopLoadable<Group>() as HydrationStores['groupsStore'],
			statusTypesStore: createNoopLoadable<never>() as HydrationStores['statusTypesStore'],
			availabilityEntriesStore: createNoopLoadable<never>() as HydrationStores['availabilityEntriesStore'],
			specialDaysStore: createNoopLoadable<never>() as HydrationStores['specialDaysStore'],
			calendarAssignmentsStore: calendarAssignments as HydrationStores['calendarAssignmentsStore'],
			trainingTypesStore: createNoopLoadable<TrainingType>() as HydrationStores['trainingTypesStore'],
			trainingViewsStore: createNoopLoadable<TrainingView>() as HydrationStores['trainingViewsStore'],
			personnelTrainingsStore: personnelTrainings as unknown as HydrationStores['personnelTrainingsStore'],
			pinnedGroupsStore: createNoopLoadable<string>() as HydrationStores['pinnedGroupsStore'],
			ratingSchemeStore: createNoopLoadable<never>() as HydrationStores['ratingSchemeStore'],
			onboardingTemplateStore: createNoopOnboardingTemplatesStore() as HydrationStores['onboardingTemplateStore'],
			onboardingStore: createNoopLoadable<never>() as HydrationStores['onboardingStore']
		} satisfies HydrationStores,
		personnelTrainings,
		calendarAssignments
	};
}

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

		expect(result).toMatchObject({
			training: {
				workspace: 'training',
				data: trainingData,
				hydration: {
					orgId: 'org-1',
					groups: expect.objectContaining({
						mode: 'replace',
						items: trainingData.groups,
						deferred: false,
						snapshotKey: expect.any(String)
					}),
					personnel: {
						scoped: expect.objectContaining({
							mode: 'replace',
							items: trainingData.personnel,
							deferred: false,
							snapshotKey: expect.any(String)
						})
					},
					trainingTypes: expect.objectContaining({
						mode: 'replace',
						items: trainingData.trainingTypes,
						deferred: false,
						snapshotKey: expect.any(String)
					}),
					trainingViews: expect.objectContaining({
						mode: 'replace',
						items: trainingData.trainingViews,
						deferred: false,
						snapshotKey: expect.any(String)
					}),
					personnelTrainings: expect.objectContaining({
						mode: 'replace',
						items: personnelTrainings,
						deferred: true,
						snapshotKey: expect.any(String)
					}),
					pinnedGroups: expect.objectContaining({
						mode: 'replace',
						items: trainingData.pinnedGroups,
						deferred: false,
						snapshotKey: expect.any(String)
					})
				}
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

	it('marks deferred personnelTrainings as loading before coordinator hydration resolves', async () => {
		const coordinator = createOrgShellCoordinator();
		const { stores, personnelTrainings } = createHydrationStores();
		let resolveTrainings!: (items: PersonnelTraining[]) => void;
		const deferredTrainings = new Promise<PersonnelTraining[]>((resolve) => {
			resolveTrainings = resolve;
		});
		const hydratedTraining = {
			id: 'pt1',
			personnelId: 'p1',
			trainingTypeId: 'tt1',
			completionDate: null,
			expirationDate: null,
			notes: null,
			certificateUrl: null
		} satisfies PersonnelTraining;

		const hydrationPromise = coordinator.hydrate(
			{
				orgId: 'org-1',
				personnelTrainings: {
					mode: 'replace',
					snapshotKey: 'personnel-trainings:deferred:1',
					items: deferredTrainings
				}
			},
			stores
		);

		expect(personnelTrainings.loading).toBe(true);

		resolveTrainings([hydratedTraining]);
		await hydrationPromise;

		expect(personnelTrainings.items).toEqual([hydratedTraining]);
		expect(personnelTrainings.loading).toBe(false);
	});

	it('marks deferred calendarAssignments as loading before coordinator hydration resolves', async () => {
		const coordinator = createOrgShellCoordinator();
		const { stores, calendarAssignments } = createHydrationStores();
		let resolveAssignments!: (items: { types: AssignmentType[]; assignments: DailyAssignment[] }) => void;
		const deferredAssignments = new Promise<{
			types: AssignmentType[];
			assignments: DailyAssignment[];
		}>((resolve) => {
			resolveAssignments = resolve;
		});

		const hydrationPromise = coordinator.hydrate(
			{
				orgId: 'org-1',
				calendarAssignments: {
					mode: 'replace',
					deferred: true,
					snapshotKey: 'calendar-assignments:deferred:1',
					items: deferredAssignments
				}
			},
			stores
		);

		expect(calendarAssignments.loading).toBe(true);

		resolveAssignments({
			types: [
				{
					id: 'at1',
					name: 'Staff Duty',
					shortName: 'SD',
					assignTo: 'personnel',
					color: '#111111',
					exemptPersonnelIds: [],
					showInDateHeader: false
				}
			],
			assignments: [{ id: 'da1', date: '2024-01-01', assignmentTypeId: 'at1', assigneeId: 'p1' }]
		});
		await hydrationPromise;

		expect(calendarAssignments.types).toMatchObject([{ id: 'at1', name: 'Staff Duty' }]);
		expect(calendarAssignments.assignments).toMatchObject([
			{ id: 'da1', date: '2024-01-01', assignmentTypeId: 'at1', assigneeId: 'p1' }
		]);
		expect(calendarAssignments.loading).toBe(false);
	});

	it('skips unchanged personnelTrainings snapshot keys through the coordinator hydrate boundary', async () => {
		const coordinator = createOrgShellCoordinator();
		const { stores, personnelTrainings } = createHydrationStores();
		const firstTraining = {
			id: 'pt1',
			personnelId: 'p1',
			trainingTypeId: 'tt1',
			completionDate: null,
			expirationDate: null,
			notes: null,
			certificateUrl: null
		} satisfies PersonnelTraining;
		const secondTraining = {
			id: 'pt2',
			personnelId: 'p2',
			trainingTypeId: 'tt2',
			completionDate: null,
			expirationDate: null,
			notes: null,
			certificateUrl: null
		} satisfies PersonnelTraining;

		await coordinator.hydrate(
			{
				orgId: 'org-1',
				personnelTrainings: {
					mode: 'replace',
					snapshotKey: 'personnel-trainings:stable',
					items: [firstTraining]
				}
			},
			stores
		);
		await coordinator.hydrate(
			{
				orgId: 'org-1',
				personnelTrainings: {
					mode: 'replace',
					snapshotKey: 'personnel-trainings:stable',
					items: [secondTraining]
				}
			},
			stores
		);

		expect(personnelTrainings.items).toEqual([firstTraining]);
	});

	it('ignores stale deferred personnelTrainings after a newer snapshot wins through the coordinator hydrate boundary', async () => {
		const coordinator = createOrgShellCoordinator();
		const { stores, personnelTrainings } = createHydrationStores();
		let resolveFirst!: (items: PersonnelTraining[]) => void;
		const firstDeferred = new Promise<PersonnelTraining[]>((resolve) => {
			resolveFirst = resolve;
		});
		const freshTraining = {
			id: 'pt1',
			personnelId: 'p1',
			trainingTypeId: 'tt1',
			completionDate: null,
			expirationDate: null,
			notes: null,
			certificateUrl: null
		} satisfies PersonnelTraining;
		const staleTraining = {
			id: 'pt2',
			personnelId: 'p2',
			trainingTypeId: 'tt2',
			completionDate: null,
			expirationDate: null,
			notes: null,
			certificateUrl: null
		} satisfies PersonnelTraining;

		const firstHydrate = coordinator.hydrate(
			{
				orgId: 'org-1',
				personnelTrainings: {
					mode: 'replace',
					snapshotKey: 'personnel-trainings:old',
					items: firstDeferred
				}
			},
			stores
		);

		await coordinator.hydrate(
			{
				orgId: 'org-1',
				personnelTrainings: {
					mode: 'replace',
					snapshotKey: 'personnel-trainings:new',
					items: [freshTraining]
				}
			},
			stores
		);

		resolveFirst([staleTraining]);
		await firstHydrate;

		expect(personnelTrainings.items).toEqual([freshTraining]);
	});
});

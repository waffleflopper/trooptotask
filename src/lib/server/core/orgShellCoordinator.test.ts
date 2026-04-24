import { describe, expect, it } from 'vitest';
import { defineStore } from '$lib/stores/core';
import { createOrgShellCoordinator as createClientOrgShellCoordinator } from '$lib/orgShellCoordinator.svelte';
import type { HydrationStores } from '$lib/orgShellCoordinator';
import {
	createInMemoryOrgAccessPort,
	createInMemoryOrgChromePort,
	createInMemoryOrgWorkspacePort
} from '$lib/server/adapters/inMemoryOrgShell';
import { createDefaultHydrationPlanner } from './hydrationPlanner';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import type { Group } from '$lib/stores/groups.svelte';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import type { PersonnelTraining, TrainingType, TrainingView } from '$features/training/training.types';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, SpecialDay, StatusType } from '$lib/types';
import type { ChromeData, MembershipInfo, OrgState, WorkspaceBootstrap, WorkspaceKey } from './orgShell';
import { createOrgShellCoordinator } from './orgShellCoordinator';
import type { CalendarBootstrap } from './useCases/calendarQuery';
import type { DashboardBootstrap } from './useCases/dashboardQuery';
import type { OnboardingBootstrap } from './useCases/onboardingQuery';
import type { PersonnelBootstrap } from './useCases/personnelWorkspaceQuery';
import type { TrainingBootstrap } from './useCases/trainingQuery';
import type { CriticalTasksBootstrap } from './useCases/criticalTasksQuery';

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
		canViewCriticalTasks: true,
		canEditCriticalTasks: false,
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

function createInspectableLoadable<T>() {
	return {
		orgId: '',
		items: [] as T[],
		loading: false,
		load(_items: T[], orgId: string) {
			this.items = _items;
			this.orgId = orgId;
			this.loading = false;
		},
		startLoading() {
			this.loading = true;
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
		templates: [] as unknown[],
		steps: [] as unknown[],
		load(_templates: unknown[], _steps: unknown[], orgId: string) {
			this.templates = _templates;
			this.steps = _steps;
			this.orgId = orgId;
		}
	};
}

function createHydrationStores() {
	const personnelTrainings = defineStore<PersonnelTraining>({ table: 'personnel_trainings' });
	const personnelIctCompletions = defineStore<PersonnelIctCompletion>({ table: 'personnel_ict_completions' });
	const calendarAssignments = createNoopCalendarAssignmentsStore();
	const personnel = defineStore<Personnel>({ table: 'personnel' });
	const groups = defineStore<Group>({ table: 'groups' });
	const ictTasks = createInspectableLoadable<IctTask>();
	const pinnedGroups = createInspectableLoadable<string>();
	const onboardingTemplates = createNoopOnboardingTemplatesStore();
	const onboardings = defineStore<PersonnelOnboarding>({ table: 'personnel_onboardings' });

	return {
		stores: {
			personnelStore: personnel as unknown as HydrationStores['personnelStore'],
			groupsStore: groups as unknown as HydrationStores['groupsStore'],
			statusTypesStore: createInspectableLoadable<never>() as HydrationStores['statusTypesStore'],
			availabilityEntriesStore: createInspectableLoadable<never>() as HydrationStores['availabilityEntriesStore'],
			specialDaysStore: createInspectableLoadable<never>() as HydrationStores['specialDaysStore'],
			calendarAssignmentsStore: calendarAssignments as HydrationStores['calendarAssignmentsStore'],
			trainingTypesStore: createInspectableLoadable<TrainingType>() as HydrationStores['trainingTypesStore'],
			trainingViewsStore: createInspectableLoadable<TrainingView>() as HydrationStores['trainingViewsStore'],
			personnelTrainingsStore: personnelTrainings as unknown as HydrationStores['personnelTrainingsStore'],
			ictTasksStore: ictTasks,
			personnelIctCompletionsStore: personnelIctCompletions,
			pinnedGroupsStore: pinnedGroups as HydrationStores['pinnedGroupsStore'],
			ratingSchemeStore: createInspectableLoadable<never>() as HydrationStores['ratingSchemeStore'],
			onboardingTemplateStore: onboardingTemplates as HydrationStores['onboardingTemplateStore'],
			onboardingStore: onboardings as unknown as HydrationStores['onboardingStore']
		} satisfies HydrationStores,
		personnel,
		groups,
		ictTasks,
		pinnedGroups,
		onboardingTemplates,
		onboardings,
		personnelTrainings,
		personnelIctCompletions,
		calendarAssignments
	};
}

function createTestCoordinator() {
	return createOrgShellCoordinator({
		hydrationCoordinator: createClientOrgShellCoordinator()
	});
}

describe('OrgShellCoordinator', () => {
	it('loads the canonical root org shell payload for the authenticated happy path', async () => {
		const coordinator = createTestCoordinator();

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
		const coordinator = createTestCoordinator();

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
		const coordinator = createTestCoordinator();

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
		const coordinator = createTestCoordinator();

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
						canViewCriticalTasks: true,
						canEditCriticalTasks: true,
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

	it('returns the canonical calendar workspace payload with composite calendar hydration through the coordinator boundary', async () => {
		const coordinator = createTestCoordinator();
		const deferredAssignments = Promise.resolve([
			{
				id: 'da1',
				date: '2024-01-01',
				assignmentTypeId: 'at1',
				assigneeId: 'p1'
			} satisfies DailyAssignment
		]);
		const calendarData: CalendarBootstrap = {
			rangeStart: '2024-01-01',
			rangeEnd: '2024-01-31',
			availabilityEntries: [
				{
					id: 'avail1',
					personnelId: 'p1',
					statusTypeId: 'st1',
					startDate: '2024-01-01',
					endDate: '2024-01-02',
					note: null
				} satisfies AvailabilityEntry
			],
			specialDays: [
				{
					id: 'special1',
					name: 'Training Holiday',
					date: '2024-01-15',
					type: 'org-closure'
				} satisfies SpecialDay
			],
			assignmentTypes: [
				{
					id: 'at1',
					name: 'Staff Duty',
					shortName: 'SD',
					assignTo: 'personnel',
					color: '#111111',
					exemptPersonnelIds: [],
					showInDateHeader: false
				} satisfies AssignmentType
			],
			dailyAssignments: deferredAssignments,
			pinnedGroups: ['Alpha'],
			advancedDutyEvents: [],
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group],
			statusTypes: [{ id: 'st1', name: 'Leave', color: '#ff0', textColor: '#000' } as StatusType],
			activeOnboardingPersonnelIds: ['p1'],
			lossWarningWindowDays: 180
		};
		const workspacePort = createInMemoryOrgWorkspacePort(new Map<WorkspaceKey, unknown>([['calendar', calendarData]]));
		const planner = createDefaultHydrationPlanner('org-1');

		const result = await coordinator.loadWorkspace<CalendarBootstrap, 'calendar'>('calendar', {
			workspace: workspacePort,
			planner
		});

		expect(result).toMatchObject({
			calendar: {
				workspace: 'calendar',
				data: calendarData,
				hydration: {
					orgId: 'org-1',
					availabilityEntries: expect.objectContaining({
						mode: 'replace',
						items: calendarData.availabilityEntries,
						deferred: false,
						snapshotKey: expect.any(String)
					}),
					specialDays: expect.objectContaining({
						mode: 'replace',
						items: calendarData.specialDays,
						deferred: false,
						snapshotKey: expect.any(String)
					}),
					calendarAssignments: expect.objectContaining({
						mode: 'replace',
						deferred: true,
						snapshotKey: expect.any(String)
					}),
					personnel: {
						scoped: expect.objectContaining({
							mode: 'replace',
							items: calendarData.personnel,
							deferred: false,
							snapshotKey: expect.any(String)
						})
					},
					groups: expect.objectContaining({
						mode: 'replace',
						items: calendarData.groups,
						deferred: false,
						snapshotKey: expect.any(String)
					}),
					statusTypes: expect.objectContaining({
						mode: 'replace',
						items: calendarData.statusTypes,
						deferred: false,
						snapshotKey: expect.any(String)
					}),
					pinnedGroups: expect.objectContaining({
						mode: 'replace',
						items: calendarData.pinnedGroups,
						deferred: false,
						snapshotKey: expect.any(String)
					})
				}
			} satisfies WorkspaceBootstrap<CalendarBootstrap>
		});

		await expect(result.calendar.hydration?.calendarAssignments?.items).resolves.toEqual({
			types: calendarData.assignmentTypes,
			assignments: await deferredAssignments
		});
		expect(result.calendar.data.activeOnboardingPersonnelIds).toEqual(['p1']);
	});

	it('streams the calendar workspace payload as a deferred bootstrap promise', async () => {
		const coordinator = createTestCoordinator();
		const deferredAssignments = Promise.resolve([
			{
				id: 'da1',
				date: '2024-01-01',
				assignmentTypeId: 'at1',
				assigneeId: 'p1'
			} satisfies DailyAssignment
		]);
		const calendarData: CalendarBootstrap = {
			rangeStart: '2024-01-01',
			rangeEnd: '2024-01-31',
			availabilityEntries: [
				{
					id: 'avail1',
					personnelId: 'p1',
					statusTypeId: 'st1',
					startDate: '2024-01-01',
					endDate: '2024-01-02',
					note: null
				} satisfies AvailabilityEntry
			],
			specialDays: [
				{
					id: 'special1',
					name: 'Training Holiday',
					date: '2024-01-15',
					type: 'org-closure'
				} satisfies SpecialDay
			],
			assignmentTypes: [
				{
					id: 'at1',
					name: 'Staff Duty',
					shortName: 'SD',
					assignTo: 'personnel',
					color: '#111111',
					exemptPersonnelIds: [],
					showInDateHeader: false
				} satisfies AssignmentType
			],
			dailyAssignments: deferredAssignments,
			pinnedGroups: ['Alpha'],
			advancedDutyEvents: [],
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group],
			statusTypes: [{ id: 'st1', name: 'Leave', color: '#ff0', textColor: '#000' } as StatusType],
			activeOnboardingPersonnelIds: ['p1'],
			lossWarningWindowDays: 180
		};
		let resolveCalendarData: ((value: CalendarBootstrap) => void) | undefined;
		const workspaceData = new Promise<CalendarBootstrap>((resolve) => {
			resolveCalendarData = resolve;
		});
		const workspacePort = {
			getWorkspaceData: async () => {
				throw new Error('streamWorkspace should not call getWorkspaceData');
			},
			streamWorkspaceData: async <T>() => ({ data: workspaceData as Promise<T> })
		};
		const planner = createDefaultHydrationPlanner('org-1');

		const result = await coordinator.streamWorkspace<CalendarBootstrap, 'calendar'>('calendar', {
			workspace: workspacePort,
			planner
		});

		expect(result.calendar.data).toBeInstanceOf(Promise);

		resolveCalendarData?.(calendarData);

		await expect(result.calendar.data).resolves.toMatchObject({
			workspace: 'calendar',
			data: calendarData,
			hydration: {
				orgId: 'org-1',
				availabilityEntries: expect.objectContaining({
					mode: 'replace',
					items: calendarData.availabilityEntries,
					deferred: false,
					snapshotKey: expect.any(String)
				}),
				specialDays: expect.objectContaining({
					mode: 'replace',
					items: calendarData.specialDays,
					deferred: false,
					snapshotKey: expect.any(String)
				}),
				calendarAssignments: expect.objectContaining({
					mode: 'replace',
					deferred: true,
					snapshotKey: expect.any(String)
				})
			}
		});
	});

	it('fails before exposing a deferred workspace promise when streamed setup rejects eagerly', async () => {
		const coordinator = createTestCoordinator();
		const planner = createDefaultHydrationPlanner('org-1');
		const workspacePort = {
			getWorkspaceData: async () => {
				throw new Error('streamWorkspace should not call getWorkspaceData');
			},
			streamWorkspaceData: async () => {
				throw new Error('Missing calendar access');
			}
		};

		await expect(
			coordinator.streamWorkspace<CalendarBootstrap, 'calendar'>('calendar', {
				workspace: workspacePort,
				planner
			})
		).rejects.toThrow('Missing calendar access');
	});

	it('returns the canonical training workspace payload with deferred personnelTrainings hydration', async () => {
		const coordinator = createTestCoordinator();
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

	it('returns the canonical Critical Tasks workspace payload with deferred completions hydration', async () => {
		const coordinator = createTestCoordinator();
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
					description: null,
					mos: ['68W'],
					expirationMonths: 12,
					sortOrder: 0,
					archivedAt: null,
					createdAt: '2026-04-01T12:00:00Z'
				} satisfies IctTask
			],
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group]
		};
		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([['critical-tasks', criticalTasksData]])
		);
		const planner = createDefaultHydrationPlanner('org-1');

		const result = await coordinator.loadWorkspace<CriticalTasksBootstrap, 'critical-tasks'>('critical-tasks', {
			workspace: workspacePort,
			planner
		});

		expect(result).toMatchObject({
			'critical-tasks': {
				workspace: 'critical-tasks',
				data: criticalTasksData,
				hydration: {
					orgId: 'org-1',
					groups: expect.objectContaining({
						mode: 'replace',
						items: criticalTasksData.groups,
						deferred: false,
						snapshotKey: expect.any(String)
					}),
					personnel: {
						scoped: expect.objectContaining({
							mode: 'replace',
							items: criticalTasksData.personnel,
							deferred: false,
							snapshotKey: expect.any(String)
						})
					},
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
			} satisfies WorkspaceBootstrap<CriticalTasksBootstrap>
		});
	});

	it('returns the canonical onboarding workspace payload with onboarding hydration through the coordinator boundary', async () => {
		const coordinator = createTestCoordinator();
		const onboardingData: OnboardingBootstrap = {
			onboardingTemplates: [
				{
					id: 'tpl1',
					orgId: 'org-1',
					name: 'Reception',
					description: null,
					createdAt: '2024-01-01'
				} satisfies OnboardingTemplate
			],
			onboardingTemplateSteps: [
				{
					id: 'step1',
					templateId: 'tpl1',
					name: 'Sign in',
					description: null,
					stepType: 'checkbox',
					trainingTypeId: null,
					stages: null,
					sortOrder: 0
				} satisfies OnboardingTemplateStep
			],
			onboardings: [
				{
					id: 'ob1',
					personnelId: 'p1',
					startedAt: '2024-01-01',
					completedAt: null,
					cancelledAt: null,
					status: 'in_progress',
					steps: [],
					templateId: 'tpl1'
				} satisfies PersonnelOnboarding
			],
			trainingTypes: [{ id: 'tt1', name: 'CPR' } as TrainingType],
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group]
		};
		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([['onboarding', onboardingData]])
		);
		const planner = createDefaultHydrationPlanner('org-1');

		const result = await coordinator.loadWorkspace<OnboardingBootstrap, 'onboarding'>('onboarding', {
			workspace: workspacePort,
			planner
		});

		expect(result).toMatchObject({
			onboarding: {
				workspace: 'onboarding',
				data: onboardingData,
				hydration: {
					orgId: 'org-1',
					groups: expect.objectContaining({
						mode: 'replace',
						items: onboardingData.groups,
						deferred: false,
						snapshotKey: expect.any(String)
					}),
					personnel: {
						scoped: expect.objectContaining({
							mode: 'replace',
							items: onboardingData.personnel,
							deferred: false,
							snapshotKey: expect.any(String)
						})
					},
					trainingTypes: expect.objectContaining({
						mode: 'replace',
						items: onboardingData.trainingTypes,
						deferred: false,
						snapshotKey: expect.any(String)
					}),
					onboardingTemplates: expect.objectContaining({
						mode: 'replace',
						templates: onboardingData.onboardingTemplates,
						steps: onboardingData.onboardingTemplateSteps,
						snapshotKey: expect.any(String)
					}),
					onboardings: expect.objectContaining({
						mode: 'replace',
						items: onboardingData.onboardings,
						deferred: false,
						snapshotKey: expect.any(String)
					})
				}
			} satisfies WorkspaceBootstrap<OnboardingBootstrap>
		});
	});

	it('returns the canonical personnel workspace payload with personnel hydration through the coordinator boundary', async () => {
		const coordinator = createTestCoordinator();
		const personnelData: PersonnelBootstrap = {
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			personnelLookup: [
				{ id: 'p1', rank: 'SGT', firstName: 'John', lastName: 'Smith' },
				{ id: 'p2', rank: 'CPT', firstName: 'Jane', lastName: 'Jones' }
			],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group],
			statusTypes: [{ id: 'st1', name: 'Leave', color: '#ff0', textColor: '#000' }],
			pinnedGroups: ['Alpha'],
			lossWarningWindowDays: 180,
			awardTrackingAcknowledgedPersonnelIds: []
		};
		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([['personnel', personnelData]])
		);
		const planner = createDefaultHydrationPlanner('org-1');

		const result = await coordinator.loadWorkspace<PersonnelBootstrap, 'personnel'>('personnel', {
			workspace: workspacePort,
			planner
		});

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

	it('returns the canonical dashboard workspace payload while keeping summary-only dashboard data out of shared hydration', async () => {
		const coordinator = createTestCoordinator();
		const deferredAssignments = Promise.resolve([
			{
				id: 'da1',
				date: '2024-01-01',
				assignmentTypeId: 'at1',
				assigneeId: 'p1'
			} satisfies DailyAssignment
		]);
		const dashboardData: DashboardBootstrap = {
			availabilityEntries: [
				{
					id: 'avail1',
					personnelId: 'p1',
					statusTypeId: 'st1',
					startDate: '2024-01-01',
					endDate: '2024-01-02',
					note: null
				} satisfies AvailabilityEntry
			],
			assignmentTypes: [
				{
					id: 'at1',
					name: 'Staff Duty',
					shortName: 'SD',
					assignTo: 'personnel',
					color: '#111111',
					exemptPersonnelIds: [],
					showInDateHeader: false
				} satisfies AssignmentType
			],
			todayAssignments: deferredAssignments,
			pinnedGroups: ['Alpha'],
			ratingSchemeEntries: [
				{
					id: 'rs1',
					ratedPersonId: 'p1',
					evalType: 'NCOER',
					raterPersonId: null,
					raterName: null,
					seniorRaterPersonId: null,
					seniorRaterName: null,
					intermediateRaterPersonId: null,
					intermediateRaterName: null,
					reviewerPersonId: null,
					reviewerName: null,
					ratingPeriodStart: '2024-01-01',
					ratingPeriodEnd: '2024-12-31',
					status: 'active',
					notes: null,
					reportType: 'AN',
					workflowStatus: 'drafting'
				} satisfies RatingSchemeEntry
			],
			activeOnboardings: [
				{
					id: 'ob1',
					personnelId: 'p1',
					startedAt: '2024-01-01',
					completedAt: null,
					cancelledAt: null,
					status: 'in_progress',
					steps: [],
					templateId: 'tpl1'
				} satisfies PersonnelOnboarding
			],
			todayDutyEvents: [],
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group],
			statusTypes: [{ id: 'st1', name: 'Leave', color: '#ff0', textColor: '#000' } as StatusType],
			trainingTypes: [{ id: 'tt1', name: 'CPR' } as TrainingType],
			lossWarningWindowDays: 180,
			awardTrackingAcknowledgedPersonnelIds: []
		};
		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([['dashboard', dashboardData]])
		);
		const planner = createDefaultHydrationPlanner('org-1');

		const result = await coordinator.loadWorkspace<DashboardBootstrap, 'dashboard'>('dashboard', {
			workspace: workspacePort,
			planner
		});

		expect(result).toMatchObject({
			dashboard: {
				workspace: 'dashboard',
				data: dashboardData,
				hydration: {
					orgId: 'org-1',
					availabilityEntries: expect.objectContaining({
						mode: 'replace',
						items: dashboardData.availabilityEntries,
						deferred: false,
						snapshotKey: expect.any(String)
					}),
					calendarAssignments: expect.objectContaining({
						mode: 'replace',
						deferred: true,
						snapshotKey: expect.any(String)
					}),
					personnel: {
						scoped: expect.objectContaining({
							mode: 'replace',
							items: dashboardData.personnel,
							deferred: false,
							snapshotKey: expect.any(String)
						})
					},
					groups: expect.objectContaining({
						mode: 'replace',
						items: dashboardData.groups,
						deferred: false,
						snapshotKey: expect.any(String)
					}),
					statusTypes: expect.objectContaining({
						mode: 'replace',
						items: dashboardData.statusTypes,
						deferred: false,
						snapshotKey: expect.any(String)
					}),
					trainingTypes: expect.objectContaining({
						mode: 'replace',
						items: dashboardData.trainingTypes,
						deferred: false,
						snapshotKey: expect.any(String)
					}),
					pinnedGroups: expect.objectContaining({
						mode: 'replace',
						items: dashboardData.pinnedGroups,
						deferred: false,
						snapshotKey: expect.any(String)
					})
				}
			} satisfies WorkspaceBootstrap<DashboardBootstrap>
		});

		expect(result.dashboard.hydration?.ratingSchemeEntries).toBeUndefined();
		expect(result.dashboard.hydration?.onboardings).toBeUndefined();
		await expect(result.dashboard.hydration?.calendarAssignments?.items).resolves.toEqual({
			types: dashboardData.assignmentTypes,
			assignments: await deferredAssignments
		});
		expect(result.dashboard.data.ratingSchemeEntries).toHaveLength(1);
		expect(result.dashboard.data.activeOnboardings).toHaveLength(1);
	});

	it('omits workspace hydration when the planner returns no plan', async () => {
		const coordinator = createTestCoordinator();
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
		const coordinator = createTestCoordinator();
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

	it('marks deferred personnelIctCompletions as loading before coordinator hydration resolves', async () => {
		const coordinator = createTestCoordinator();
		const { stores, personnelIctCompletions, ictTasks, personnelTrainings } = createHydrationStores();
		let resolveCompletions!: (items: PersonnelIctCompletion[]) => void;
		const deferredCompletions = new Promise<PersonnelIctCompletion[]>((resolve) => {
			resolveCompletions = resolve;
		});
		const hydratedTask = {
			id: 'task1',
			taskCode: '181-105-1001',
			title: 'Perform tactical combat casualty care',
			description: null,
			mos: ['68W'],
			expirationMonths: 12,
			sortOrder: 0,
			archivedAt: null,
			createdAt: '2026-04-01T12:00:00Z'
		} satisfies IctTask;
		const hydratedCompletion = {
			id: 'ictc1',
			personnelId: 'p1',
			ictTaskId: 'task1',
			completedAt: '2026-04-01',
			validationMethod: 'Lecture',
			validatedBy: null,
			notes: null,
			loggedBy: 'user-1',
			createdAt: '2026-04-01T12:00:00Z'
		} satisfies PersonnelIctCompletion;

		const hydrationPromise = coordinator.hydrate(
			{
				orgId: 'org-1',
				ictTasks: {
					mode: 'replace',
					snapshotKey: 'ict-tasks:1',
					items: [hydratedTask]
				},
				personnelIctCompletions: {
					mode: 'replace',
					snapshotKey: 'personnel-ict-completions:deferred:1',
					items: deferredCompletions
				}
			},
			stores
		);

		expect(personnelIctCompletions.loading).toBe(true);

		resolveCompletions([hydratedCompletion]);
		await hydrationPromise;

		expect(ictTasks.items).toEqual([hydratedTask]);
		expect(personnelIctCompletions.items).toEqual([hydratedCompletion]);
		expect(personnelIctCompletions.loading).toBe(false);
		expect(personnelTrainings.items).toEqual([]);
	});

	it('marks deferred calendarAssignments as loading before coordinator hydration resolves', async () => {
		const coordinator = createTestCoordinator();
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

	it('hydrates onboarding templates and onboardings through the coordinator boundary', async () => {
		const coordinator = createTestCoordinator();
		const { stores, onboardingTemplates, onboardings } = createHydrationStores();
		const template = {
			id: 'tpl1',
			orgId: 'org-1',
			name: 'Reception',
			description: null,
			createdAt: '2024-01-01'
		} satisfies OnboardingTemplate;
		const step = {
			id: 'step1',
			templateId: 'tpl1',
			name: 'Sign in',
			description: null,
			stepType: 'checkbox',
			trainingTypeId: null,
			stages: null,
			sortOrder: 0
		} satisfies OnboardingTemplateStep;
		const onboarding = {
			id: 'ob1',
			personnelId: 'p1',
			startedAt: '2024-01-01',
			completedAt: null,
			cancelledAt: null,
			status: 'in_progress',
			steps: [],
			templateId: 'tpl1'
		} satisfies PersonnelOnboarding;

		await coordinator.hydrate(
			{
				orgId: 'org-1',
				onboardingTemplates: {
					mode: 'replace',
					snapshotKey: 'onboarding-templates:1',
					templates: [template],
					steps: [step]
				},
				onboardings: {
					mode: 'replace',
					snapshotKey: 'onboardings:1',
					items: [onboarding]
				}
			},
			stores
		);

		expect(onboardingTemplates.templates).toEqual([template]);
		expect(onboardingTemplates.steps).toEqual([step]);
		expect(onboardingTemplates.orgId).toBe('org-1');
		expect(onboardings.items).toEqual([onboarding]);
	});

	it('hydrates personnel, groups, and pinned groups through the coordinator boundary', async () => {
		const coordinator = createTestCoordinator();
		const { stores, personnel, groups, pinnedGroups } = createHydrationStores();
		const person = { id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel;
		const group = { id: 'g1', name: 'Alpha', sortOrder: 0 } as Group;

		await coordinator.hydrate(
			{
				orgId: 'org-1',
				personnel: {
					scoped: {
						mode: 'replace',
						snapshotKey: 'personnel:1',
						items: [person]
					}
				},
				groups: {
					mode: 'replace',
					snapshotKey: 'groups:1',
					items: [group]
				},
				pinnedGroups: {
					mode: 'replace',
					snapshotKey: 'pinned-groups:1',
					items: ['Alpha']
				}
			},
			stores
		);

		expect(personnel.items).toEqual([person]);
		expect(groups.items).toEqual([group]);
		expect(pinnedGroups.items).toEqual(['Alpha']);
		expect(pinnedGroups.orgId).toBe('org-1');
	});

	it('skips unchanged personnelTrainings snapshot keys through the coordinator hydrate boundary', async () => {
		const coordinator = createTestCoordinator();
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

	it('skips unchanged onboardings snapshot keys so optimistic onboarding state survives through the coordinator hydrate boundary', async () => {
		const coordinator = createTestCoordinator();
		const { stores, onboardings } = createHydrationStores();
		const serverOnboarding = {
			id: 'ob1',
			personnelId: 'p1',
			startedAt: '2024-01-01',
			completedAt: null,
			cancelledAt: null,
			status: 'in_progress',
			steps: [],
			templateId: 'tpl1'
		} satisfies PersonnelOnboarding;
		const optimisticOnboarding = {
			id: 'temp-ob-2',
			personnelId: 'p2',
			startedAt: '2024-01-02',
			completedAt: null,
			cancelledAt: null,
			status: 'in_progress',
			steps: [],
			templateId: null
		} satisfies PersonnelOnboarding;

		await coordinator.hydrate(
			{
				orgId: 'org-1',
				onboardings: {
					mode: 'replace',
					snapshotKey: 'onboardings:stable',
					items: [serverOnboarding]
				}
			},
			stores
		);

		onboardings.appendLocal([optimisticOnboarding]);

		await coordinator.hydrate(
			{
				orgId: 'org-1',
				onboardings: {
					mode: 'replace',
					snapshotKey: 'onboardings:stable',
					items: [serverOnboarding]
				}
			},
			stores
		);

		expect(onboardings.items).toEqual([serverOnboarding, optimisticOnboarding]);
	});

	it('skips unchanged personnel snapshot keys so optimistic personnel state survives through the coordinator hydrate boundary', async () => {
		const coordinator = createTestCoordinator();
		const { stores, personnel } = createHydrationStores();
		const serverPerson = { id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel;
		const optimisticPerson = { id: 'temp-p2', firstName: 'Jane', lastName: 'Jones' } as Personnel;

		await coordinator.hydrate(
			{
				orgId: 'org-1',
				personnel: {
					scoped: {
						mode: 'replace',
						snapshotKey: 'personnel:stable',
						items: [serverPerson]
					}
				}
			},
			stores
		);

		personnel.appendLocal([optimisticPerson]);

		await coordinator.hydrate(
			{
				orgId: 'org-1',
				personnel: {
					scoped: {
						mode: 'replace',
						snapshotKey: 'personnel:stable',
						items: [serverPerson]
					}
				}
			},
			stores
		);

		expect(personnel.items).toEqual([serverPerson, optimisticPerson]);
	});

	it('ignores stale deferred personnelTrainings after a newer snapshot wins through the coordinator hydrate boundary', async () => {
		const coordinator = createTestCoordinator();
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

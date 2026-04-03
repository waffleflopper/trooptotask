import { describe, expect, it } from 'vitest';
import { createInMemoryOrgWorkspacePort } from '$lib/server/adapters/inMemoryOrgShell';
import type { WorkspaceKey, WorkspaceBootstrap } from '../orgShell';
import type { CalendarBootstrap } from './calendarQuery';
import type { OnboardingBootstrap } from './onboardingQuery';
import type { PersonnelBootstrap } from './personnelWorkspaceQuery';
import type { TrainingBootstrap } from './trainingQuery';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import type { PersonnelTraining, TrainingType, TrainingView } from '$features/training/training.types';
import type {
	AssignmentType,
	AvailabilityEntry,
	DailyAssignment,
	Personnel,
	PersonnelLookup,
	SpecialDay,
	StatusType
} from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import { loadOrgWorkspaceRouteData } from './loadOrgWorkspaceRouteData';
import { createDefaultHydrationPlanner } from '../hydrationPlanner';

describe('loadOrgWorkspaceRouteData', () => {
	it('returns the canonical calendar route payload with calendar-owned hydration targets', async () => {
		const calendarData: CalendarBootstrap = {
			availabilityEntries: [
				{
					id: 'av1',
					personnelId: 'p1',
					statusTypeId: 'st1',
					startDate: '2024-01-01',
					endDate: '2024-01-01',
					note: null
				} satisfies AvailabilityEntry
			],
			specialDays: [
				{
					id: 'sd1',
					name: 'Training Holiday',
					date: '2024-01-15',
					type: 'org-closure'
				} satisfies SpecialDay
			],
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
			dailyAssignments: [
				{
					id: 'da1',
					date: '2024-01-15',
					assignmentTypeId: 'at1',
					assigneeId: 'p1'
				} satisfies DailyAssignment
			],
			pinnedGroups: ['Alpha'],
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group],
			statusTypes: [{ id: 'st1', name: 'Leave', color: '#ff0', textColor: '#000' } as StatusType],
			activeOnboardingPersonnelIds: ['p1']
		};

		const workspacePort = createInMemoryOrgWorkspacePort(new Map<WorkspaceKey, unknown>([['calendar', calendarData]]));
		const plannerPort = createDefaultHydrationPlanner('org-1');

		const result = await loadOrgWorkspaceRouteData('calendar', workspacePort, plannerPort);

		expect(result).toEqual({
			calendar: {
				workspace: 'calendar',
				data: calendarData,
				hydration: expect.objectContaining({
					orgId: 'org-1',
					groups: {
						mode: 'replace',
						items: calendarData.groups,
						snapshotKey: expect.any(String)
					},
					personnel: {
						scoped: {
							mode: 'replace',
							items: calendarData.personnel,
							snapshotKey: expect.any(String)
						}
					},
					statusTypes: {
						mode: 'replace',
						items: calendarData.statusTypes,
						snapshotKey: expect.any(String)
					},
					availabilityEntries: {
						mode: 'replace',
						items: calendarData.availabilityEntries,
						snapshotKey: expect.any(String)
					},
					specialDays: {
						mode: 'replace',
						items: calendarData.specialDays,
						snapshotKey: expect.any(String)
					},
					calendarAssignments: {
						mode: 'replace',
						snapshotKey: expect.any(String),
						types: calendarData.assignmentTypes,
						assignments: calendarData.dailyAssignments
					},
					pinnedGroups: {
						mode: 'replace',
						items: calendarData.pinnedGroups,
						snapshotKey: expect.any(String)
					}
				})
			} satisfies WorkspaceBootstrap<CalendarBootstrap>
		});
	});

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

	it('returns the canonical onboarding route payload with onboarding-owned hydration targets', async () => {
		const onboardingTemplates = [
			{
				id: 'tpl1',
				orgId: 'org-1',
				name: 'Reception',
				description: null,
				createdAt: '2024-01-01'
			} satisfies OnboardingTemplate
		];
		const onboardingTemplateSteps = [
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
		];
		const onboardings = [
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
		];
		const onboardingData: OnboardingBootstrap = {
			onboardingTemplates,
			onboardingTemplateSteps,
			onboardings,
			trainingTypes: [{ id: 'tt1', name: 'CPR' } as TrainingType],
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group]
		};

		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([['onboarding', onboardingData]])
		);
		const plannerPort = createDefaultHydrationPlanner('org-1');

		const result = await loadOrgWorkspaceRouteData('onboarding', workspacePort, plannerPort);

		expect(result).toEqual({
			onboarding: {
				workspace: 'onboarding',
				data: onboardingData,
				hydration: expect.objectContaining({
					orgId: 'org-1',
					groups: {
						mode: 'replace',
						items: onboardingData.groups,
						snapshotKey: expect.any(String)
					},
					personnel: {
						scoped: {
							mode: 'replace',
							items: onboardingData.personnel,
							snapshotKey: expect.any(String)
						}
					},
					trainingTypes: {
						mode: 'replace',
						items: onboardingData.trainingTypes,
						snapshotKey: expect.any(String)
					},
					onboardingTemplates: {
						mode: 'replace',
						templates: onboardingData.onboardingTemplates,
						steps: onboardingData.onboardingTemplateSteps,
						snapshotKey: expect.any(String)
					},
					onboardings: {
						mode: 'replace',
						items: onboardingData.onboardings,
						snapshotKey: expect.any(String)
					}
				})
			} satisfies WorkspaceBootstrap<OnboardingBootstrap>
		});
	});

	it('returns the canonical personnel route payload with personnel-owned hydration targets', async () => {
		const ratingSchemeEntries = [
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
		];
		const personnelData: PersonnelBootstrap = {
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			personnelLookup: [
				{ id: 'p1', rank: 'SGT', firstName: 'John', lastName: 'Smith' } as PersonnelLookup,
				{ id: 'p2', rank: 'CPT', firstName: 'Jane', lastName: 'Jones' } as PersonnelLookup
			],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group],
			statusTypes: [{ id: 'st1', name: 'Leave', color: '#ff0', textColor: '#000' } as StatusType],
			pinnedGroups: ['Alpha'],
			ratingSchemeEntries
		};

		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([['personnel', personnelData]])
		);
		const plannerPort = createDefaultHydrationPlanner('org-1');

		const result = await loadOrgWorkspaceRouteData('personnel', workspacePort, plannerPort);

		expect(result).toEqual({
			personnel: {
				workspace: 'personnel',
				data: personnelData,
				hydration: expect.objectContaining({
					orgId: 'org-1',
					personnel: {
						scoped: {
							mode: 'replace',
							items: personnelData.personnel,
							snapshotKey: expect.any(String)
						}
					},
					groups: {
						mode: 'replace',
						items: personnelData.groups,
						snapshotKey: expect.any(String)
					},
					statusTypes: {
						mode: 'replace',
						items: personnelData.statusTypes,
						snapshotKey: expect.any(String)
					},
					pinnedGroups: {
						mode: 'replace',
						items: personnelData.pinnedGroups,
						snapshotKey: expect.any(String)
					},
					ratingSchemeEntries: {
						mode: 'replace',
						items: personnelData.ratingSchemeEntries,
						snapshotKey: expect.any(String)
					}
				})
			} satisfies WorkspaceBootstrap<PersonnelBootstrap>
		});
	});

	it('returns the canonical dashboard route payload with dashboard-owned hydration targets', async () => {
		const dashboardData = {
			availabilityEntries: [
				{
					id: 'av1',
					personnelId: 'p1',
					statusTypeId: 'st1',
					startDate: '2024-01-01',
					endDate: '2024-01-01',
					note: null
				} satisfies AvailabilityEntry
			],
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
			todayAssignments: [
				{
					id: 'da1',
					date: '2024-01-15',
					assignmentTypeId: 'at1',
					assigneeId: 'p1'
				} satisfies DailyAssignment
			],
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
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group],
			statusTypes: [{ id: 'st1', name: 'Leave', color: '#ff0', textColor: '#000' } as StatusType],
			trainingTypes: [{ id: 'tt1', name: 'CPR' } as TrainingType]
		};

		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([['dashboard', dashboardData]])
		);
		const plannerPort = createDefaultHydrationPlanner('org-1');

		const result = await loadOrgWorkspaceRouteData('dashboard', workspacePort, plannerPort);

		expect(result).toEqual({
			dashboard: {
				workspace: 'dashboard',
				data: dashboardData,
				hydration: expect.objectContaining({
					orgId: 'org-1',
					personnel: {
						scoped: {
							mode: 'replace',
							items: dashboardData.personnel,
							snapshotKey: expect.any(String)
						}
					},
					groups: {
						mode: 'replace',
						items: dashboardData.groups,
						snapshotKey: expect.any(String)
					},
					statusTypes: {
						mode: 'replace',
						items: dashboardData.statusTypes,
						snapshotKey: expect.any(String)
					},
					availabilityEntries: {
						mode: 'replace',
						items: dashboardData.availabilityEntries,
						snapshotKey: expect.any(String)
					},
					calendarAssignments: {
						mode: 'replace',
						snapshotKey: expect.any(String),
						types: dashboardData.assignmentTypes,
						assignments: dashboardData.todayAssignments
					},
					trainingTypes: {
						mode: 'replace',
						items: dashboardData.trainingTypes,
						snapshotKey: expect.any(String)
					},
					pinnedGroups: {
						mode: 'replace',
						items: dashboardData.pinnedGroups,
						snapshotKey: expect.any(String)
					}
				})
			} satisfies WorkspaceBootstrap<typeof dashboardData>
		});
	});
});

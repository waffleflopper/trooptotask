import { describe, it, expect } from 'vitest';
import { loadOrgWorkspace } from './loadOrgWorkspace';
import {
	createInMemoryOrgWorkspacePort,
	createInMemoryHydrationPlannerPort
} from '$lib/server/adapters/inMemoryOrgShell';
import type { WorkspaceKey, HydrationPlan } from '../orgShell';
import type { CalendarBootstrap } from './calendarQuery';
import type { TrainingBootstrap } from './trainingQuery';
import type { OnboardingBootstrap } from './onboardingQuery';
import type { DashboardBootstrap } from './dashboardQuery';
import { createDefaultHydrationPlanner } from '../hydrationPlanner';
import type { PersonnelTraining, TrainingType, TrainingView } from '$features/training/training.types';
import type { Personnel, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';

const ORG = 'test-org';

const stubHydration: HydrationPlan = {
	orgId: ORG,
	groups: { mode: 'replace', snapshotKey: 'groups-snap', items: [] }
};

describe('loadOrgWorkspace', () => {
	it('passes the workspace key to the workspace port', async () => {
		const calendarData = {
			availabilityEntries: [],
			specialDays: [],
			assignmentTypes: [],
			dailyAssignments: [],
			pinnedGroups: [],
			activeOnboardingPersonnelIds: []
		};
		const personnelData = { personnel: [] };
		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([
				['calendar', calendarData],
				['personnel', personnelData]
			])
		);
		const plannerPort = createInMemoryHydrationPlannerPort(new Map());

		const calendarResult = await loadOrgWorkspace('calendar', workspacePort, plannerPort);
		const personnelResult = await loadOrgWorkspace('personnel', workspacePort, plannerPort);

		expect(calendarResult.data).toEqual(calendarData);
		expect(personnelResult.data).toEqual(personnelData);
	});

	it('omits hydration when planner returns undefined', async () => {
		const calendarData = {
			availabilityEntries: [],
			specialDays: [],
			assignmentTypes: [],
			dailyAssignments: [],
			pinnedGroups: [],
			activeOnboardingPersonnelIds: []
		};
		const workspacePort = createInMemoryOrgWorkspacePort(new Map<WorkspaceKey, unknown>([['calendar', calendarData]]));
		const plannerPort = createInMemoryHydrationPlannerPort(new Map()); // no plan seeded

		const result = await loadOrgWorkspace('calendar', workspacePort, plannerPort);

		expect(result.hydration).toBeUndefined();
	});

	it('returns WorkspaceBootstrap with workspace key, data, and hydration plan', async () => {
		const calendarData = {
			availabilityEntries: [],
			specialDays: [],
			assignmentTypes: [],
			dailyAssignments: [],
			pinnedGroups: [],
			activeOnboardingPersonnelIds: []
		};
		const workspacePort = createInMemoryOrgWorkspacePort(new Map<WorkspaceKey, unknown>([['calendar', calendarData]]));
		const plannerPort = createInMemoryHydrationPlannerPort(
			new Map<WorkspaceKey, HydrationPlan>([['calendar', stubHydration]])
		);

		const result = await loadOrgWorkspace('calendar', workspacePort, plannerPort);

		expect(result.workspace).toBe('calendar');
		expect(result.data).toEqual(calendarData);
		expect(result.hydration).toEqual(stubHydration);
	});

	it('preserves all CalendarBootstrap fields in data', async () => {
		const calendarData: CalendarBootstrap = {
			availabilityEntries: [{ id: 'a1' } as CalendarBootstrap['availabilityEntries'][0]],
			specialDays: [{ id: 'sd1' } as CalendarBootstrap['specialDays'][0]],
			assignmentTypes: [{ id: 'at1' } as CalendarBootstrap['assignmentTypes'][0]],
			dailyAssignments: [{ id: 'da1' } as CalendarBootstrap['dailyAssignments'][0]],
			pinnedGroups: ['Alpha'],
			activeOnboardingPersonnelIds: ['p1']
		};
		const workspacePort = createInMemoryOrgWorkspacePort(new Map<WorkspaceKey, unknown>([['calendar', calendarData]]));
		const plannerPort = createInMemoryHydrationPlannerPort(new Map());

		const result = await loadOrgWorkspace<CalendarBootstrap>('calendar', workspacePort, plannerPort);

		expect(result.data.availabilityEntries).toHaveLength(1);
		expect(result.data.specialDays).toHaveLength(1);
		expect(result.data.assignmentTypes).toHaveLength(1);
		expect(result.data.dailyAssignments).toHaveLength(1);
		expect(result.data.pinnedGroups).toEqual(['Alpha']);
		expect(result.data.activeOnboardingPersonnelIds).toEqual(['p1']);
	});
});

describe('loadOrgWorkspace — training workspace boundary', () => {
	const ORG = 'org-train';
	const trainingTypes = [{ id: 'tt1', name: 'CPR' } as unknown as TrainingType];
	const trainingViews = [
		{
			id: 'tv1',
			name: 'All Personnel',
			columnIds: [],
			createdBy: 'u1',
			createdAt: '2024-01-01',
			updatedAt: '2024-01-01'
		} as TrainingView
	];
	const personnel = [{ id: 'p1', lastName: 'Smith', firstName: 'John' } as unknown as Personnel];
	const personnelTrainings = [
		{
			id: 'pt1',
			personnelId: 'p1',
			trainingTypeId: 'tt1',
			completionDate: null,
			expirationDate: null,
			notes: null,
			certificateUrl: null
		} as PersonnelTraining
	];

	const trainingData: TrainingBootstrap = {
		personnelTrainings: Promise.resolve(personnelTrainings),
		trainingTypes,
		trainingViews,
		personnel
	};

	it('returns training-owned data from workspace port', async () => {
		const workspacePort = createInMemoryOrgWorkspacePort(new Map<WorkspaceKey, unknown>([['training', trainingData]]));
		const plannerPort = createInMemoryHydrationPlannerPort(new Map());

		const result = await loadOrgWorkspace<TrainingBootstrap>('training', workspacePort, plannerPort);

		expect(result.workspace).toBe('training');
		expect(result.data.trainingTypes).toEqual(trainingTypes);
		expect(result.data.trainingViews).toEqual(trainingViews);
		expect(result.data.personnel).toEqual(personnel);
		await expect(result.data.personnelTrainings).resolves.toEqual(personnelTrainings);
	});

	it('hydration plan covers trainingViews, trainingTypes, and personnel', async () => {
		const workspacePort = createInMemoryOrgWorkspacePort(new Map<WorkspaceKey, unknown>([['training', trainingData]]));
		const plannerPort = createDefaultHydrationPlanner(ORG);

		const result = await loadOrgWorkspace<TrainingBootstrap>('training', workspacePort, plannerPort);

		expect(result.hydration?.trainingViews).toBeDefined();
		expect(result.hydration?.trainingTypes).toBeDefined();
		expect(result.hydration?.personnel).toBeDefined();
	});
});

describe('loadOrgWorkspace — onboarding workspace boundary', () => {
	const ORG = 'org-onboarding';
	const personnel = [{ id: 'p1', lastName: 'Smith', firstName: 'John' } as unknown as Personnel];
	const groups = [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group];
	const statusTypes = [{ id: 'st1', name: 'Leave', color: '#000', textColor: '#fff' } as StatusType];
	const trainingTypes = [{ id: 'tt1', name: 'CPR' } as unknown as TrainingType];

	const onboardingData: OnboardingBootstrap = {
		onboardingTemplates: [{ id: 'tpl1', name: 'Reception' } as OnboardingBootstrap['onboardingTemplates'][0]],
		onboardingTemplateSteps: [
			{ id: 'step1', templateId: 'tpl1', name: 'Sign in' } as OnboardingBootstrap['onboardingTemplateSteps'][0]
		],
		onboardings: [{ id: 'ob1', personnelId: 'p1' } as OnboardingBootstrap['onboardings'][0]],
		personnel,
		groups,
		trainingTypes
	};

	it('returns onboarding-owned data from workspace port', async () => {
		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([['onboarding', onboardingData]])
		);
		const plannerPort = createInMemoryHydrationPlannerPort(new Map());

		const result = await loadOrgWorkspace<OnboardingBootstrap>('onboarding', workspacePort, plannerPort);

		expect(result.workspace).toBe('onboarding');
		expect(result.data.onboardingTemplates).toEqual(onboardingData.onboardingTemplates);
		expect(result.data.onboardingTemplateSteps).toEqual(onboardingData.onboardingTemplateSteps);
		expect(result.data.onboardings).toEqual(onboardingData.onboardings);
		expect(result.data.personnel).toEqual(personnel);
		expect(result.data.groups).toEqual(groups);
		expect(result.data.trainingTypes).toEqual(trainingTypes);
	});

	it('hydrates onboarding reference data explicitly', async () => {
		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([['onboarding', onboardingData]])
		);
		const plannerPort = createDefaultHydrationPlanner(ORG);

		const result = await loadOrgWorkspace<OnboardingBootstrap>('onboarding', workspacePort, plannerPort);

		expect(result.hydration?.personnel).toBeDefined();
		expect(result.hydration?.groups).toBeDefined();
		expect(result.hydration?.trainingTypes).toBeDefined();
	});
});

describe('loadOrgWorkspace — dashboard workspace boundary', () => {
	const ORG = 'org-dashboard';
	const personnel = [{ id: 'p1', lastName: 'Smith', firstName: 'John' } as unknown as Personnel];
	const groups = [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group];
	const statusTypes = [{ id: 'st1', name: 'Leave', color: '#000', textColor: '#fff' } as StatusType];
	const trainingTypes = [{ id: 'tt1', name: 'CPR' } as unknown as TrainingType];

	const dashboardData: DashboardBootstrap = {
		availabilityEntries: [],
		assignmentTypes: [],
		todayAssignments: [],
		pinnedGroups: [],
		ratingSchemeEntries: [],
		activeOnboardings: [],
		personnel,
		groups,
		statusTypes,
		trainingTypes
	};

	it('returns dashboard-owned data from workspace port', async () => {
		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([['dashboard', dashboardData]])
		);
		const plannerPort = createInMemoryHydrationPlannerPort(new Map());

		const result = await loadOrgWorkspace<DashboardBootstrap>('dashboard', workspacePort, plannerPort);

		expect(result.workspace).toBe('dashboard');
		expect(result.data.personnel).toEqual(personnel);
		expect(result.data.groups).toEqual(groups);
		expect(result.data.statusTypes).toEqual(statusTypes);
		expect(result.data.trainingTypes).toEqual(trainingTypes);
		expect(result.data.availabilityEntries).toEqual([]);
		expect(result.data.assignmentTypes).toEqual([]);
		expect(result.data.todayAssignments).toEqual([]);
		expect(result.data.pinnedGroups).toEqual([]);
		expect(result.data.ratingSchemeEntries).toEqual([]);
		expect(result.data.activeOnboardings).toEqual([]);
		expect(result.hydration).toBeUndefined();
	});

	it('hydrates dashboard reference data explicitly', async () => {
		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([['dashboard', dashboardData]])
		);
		const plannerPort = createDefaultHydrationPlanner(ORG);

		const result = await loadOrgWorkspace<DashboardBootstrap>('dashboard', workspacePort, plannerPort);

		expect(result.hydration?.personnel).toBeDefined();
		expect(result.hydration?.groups).toBeDefined();
		expect(result.hydration?.statusTypes).toBeDefined();
		expect(result.hydration?.trainingTypes).toBeDefined();
	});
});

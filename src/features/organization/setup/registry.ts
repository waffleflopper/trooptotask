import type { SetupBranch } from './branch';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { setupHasData, type SetupDataFacts } from './hasData';

export type SetupStepKey =
	| 'welcome'
	| 'groups'
	| 'ranks'
	| 'personnel'
	| 'calendar'
	| 'training'
	| 'criticalTasks'
	| 'evaluations'
	| 'onboarding'
	| 'lossesAndAwards'
	| 'eventsAndTaskings'
	| 'invite';

export type SetupFact<T> = { status: 'ready'; value: T } | { status: 'error'; message: string };
export interface SetupFacts {
	branch: SetupBranch | null;
	groups: SetupFact<number>;
	activeRanks: SetupFact<number>;
	activePeople: SetupFact<number>;
	statusTypes: SetupFact<number>;
	assignmentTypes: SetupFact<number>;
	trainingTypes: SetupFact<number>;
	criticalTasks: SetupFact<number>;
	evaluations: SetupFact<number>;
	onboardingTemplates: SetupFact<number>;
	events: SetupFact<number>;
	taskings: SetupFact<number>;
	members: SetupFact<number>;
	pendingInvitations: SetupFact<number>;
	lossWarningWindowDays: SetupFact<number>;
}

export function factValue<T>(fact: SetupFact<T>): T | null {
	return fact.status === 'ready' ? fact.value : null;
}

export function setupDataFacts(facts: SetupFacts): SetupDataFacts {
	return {
		trainingTypeCount: factValue(facts.trainingTypes),
		hasActiveCriticalTasks: facts.criticalTasks.status === 'ready' ? facts.criticalTasks.value > 0 : null,
		ratingSchemeEntryCount: factValue(facts.evaluations),
		hasOnboardingTemplate: facts.onboardingTemplates.status === 'ready' ? facts.onboardingTemplates.value > 0 : null
	};
}

export type SetupFactKey = Exclude<keyof SetupFacts, 'branch'>;

export interface SetupStep {
	key: SetupStepKey;
	slug: string;
	group: 'unit' | 'features' | 'team';
	title: string;
	pitch: string;
	featureSwitch?: FeatureKey;
	since?: string;
	factSources: readonly SetupFactKey[];
	hasData(facts: SetupFacts): boolean;
}

export const SETUP_STEPS: readonly SetupStep[] = [
	{
		key: 'welcome',
		slug: 'welcome',
		group: 'unit',
		title: 'Welcome',
		pitch: 'Walk through your unit and each feature. Skip any step and change your choices later in Settings.',
		factSources: [],
		hasData: (facts) => facts.branch !== null
	},
	{
		key: 'groups',
		slug: 'groups',
		group: 'unit',
		title: 'Groups',
		pitch: 'Organize your roster into the Groups your unit works in.',
		factSources: ['groups'],
		hasData: (facts) => (factValue(facts.groups) ?? 0) > 0
	},
	{
		key: 'ranks',
		slug: 'ranks',
		group: 'unit',
		title: 'Ranks',
		pitch: 'Choose the ranks your unit uses, including civilian grades and custom ranks.',
		factSources: ['activeRanks'],
		hasData: () => false
	},
	{
		key: 'personnel',
		slug: 'personnel',
		group: 'unit',
		title: 'Personnel',
		pitch: 'Everything starts with your roster. Import your spreadsheet or add people by hand.',
		factSources: ['activePeople'],
		hasData: (facts) => (factValue(facts.activePeople) ?? 0) > 0
	},
	{
		key: 'calendar',
		slug: 'calendar',
		group: 'unit',
		title: 'Calendar',
		pitch: 'Review the statuses and duty assignments your unit tracks each day.',
		factSources: ['statusTypes', 'assignmentTypes'],
		hasData: (facts) => (factValue(facts.statusTypes) ?? 0) > 0 || (factValue(facts.assignmentTypes) ?? 0) > 0
	},
	{
		key: 'training',
		slug: 'training',
		group: 'features',
		title: 'Training',
		pitch: 'Know who is current on every requirement and see what expires next.',
		featureSwitch: 'training',
		factSources: ['trainingTypes'],
		hasData: (facts) => setupHasData.training(setupDataFacts(facts)) === true
	},
	{
		key: 'criticalTasks',
		slug: 'critical-tasks',
		group: 'features',
		title: 'Critical tasks',
		pitch: 'Track task lists and sign-offs so you know who is ready.',
		featureSwitch: 'criticalTasks',
		factSources: ['criticalTasks'],
		hasData: (facts) => setupHasData.criticalTasks(setupDataFacts(facts)) === true
	},
	{
		key: 'evaluations',
		slug: 'evaluations',
		group: 'features',
		title: 'Evaluations',
		pitch: 'Keep the rating scheme and evaluation due dates in one place.',
		featureSwitch: 'evaluations',
		factSources: ['evaluations'],
		hasData: (facts) => setupHasData.evaluations(setupDataFacts(facts)) === true
	},
	{
		key: 'onboarding',
		slug: 'onboarding',
		group: 'features',
		title: 'Onboarding',
		pitch: 'Give every new arrival a checklist and see what still needs to happen.',
		featureSwitch: 'onboarding',
		factSources: ['onboardingTemplates'],
		hasData: (facts) => setupHasData.onboarding(setupDataFacts(facts)) === true
	},
	{
		key: 'lossesAndAwards',
		slug: 'losses-and-awards',
		group: 'features',
		title: 'Losses and awards',
		pitch: 'See who is leaving and prepare their end-of-tour awards.',
		featureSwitch: 'lossesAndAwards',
		factSources: ['lossWarningWindowDays'],
		hasData: () => false
	},
	{
		key: 'eventsAndTaskings',
		slug: 'events-and-taskings',
		group: 'features',
		title: 'Events & Taskings',
		pitch: 'Record events and taskings, staff them from your roster and track suspenses.',
		featureSwitch: 'eventsAndTaskings',
		factSources: ['events', 'taskings'],
		hasData: (facts) => (factValue(facts.events) ?? 0) > 0 || (factValue(facts.taskings) ?? 0) > 0
	},
	{
		key: 'invite',
		slug: 'invite',
		group: 'team',
		title: 'Invite your team',
		pitch: 'Invite the people who help run your unit and choose what each person can do.',
		factSources: ['members', 'pendingInvitations'],
		hasData: (facts) => (factValue(facts.members) ?? 0) > 1 || (factValue(facts.pendingInvitations) ?? 0) > 0
	}
];

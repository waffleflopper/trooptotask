import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, SpecialDay, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import type { PersonnelTraining, TrainingType, TrainingView } from '$features/training/training.types';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { HydrationPlan } from '$lib/server/core/orgShell';

export interface Loadable<T> {
	readonly orgId: string;
	readonly items?: T[];
	load(items: T[], orgId: string): void;
	startLoading?(): void;
}

export interface CalendarAssignmentsLoadable {
	readonly orgId: string;
	readonly types?: AssignmentType[];
	readonly assignments?: DailyAssignment[];
	load(types: AssignmentType[], assignments: DailyAssignment[], orgId: string): void;
	startLoading?(): void;
}

export interface OnboardingTemplatesLoadable {
	readonly orgId: string;
	load(templates: OnboardingTemplate[], steps: OnboardingTemplateStep[], orgId: string): void;
}

export interface HydrationStores {
	personnelStore: Loadable<Personnel>;
	groupsStore: Loadable<Group>;
	statusTypesStore: Loadable<StatusType>;
	availabilityEntriesStore: Loadable<AvailabilityEntry>;
	specialDaysStore: Loadable<SpecialDay>;
	calendarAssignmentsStore: CalendarAssignmentsLoadable;
	trainingTypesStore: Loadable<TrainingType>;
	trainingViewsStore: Loadable<TrainingView>;
	personnelTrainingsStore: Loadable<PersonnelTraining>;
	ictTasksStore: Loadable<IctTask>;
	personnelIctCompletionsStore: Loadable<PersonnelIctCompletion>;
	pinnedGroupsStore: Loadable<string>;
	ratingSchemeStore: Loadable<RatingSchemeEntry>;
	onboardingTemplateStore: OnboardingTemplatesLoadable;
	onboardingStore: Loadable<PersonnelOnboarding>;
}

export interface OrgShellHydrator {
	hydrate(plan?: HydrationPlan, stores?: HydrationStores): Promise<void>;
	reset(): void;
}

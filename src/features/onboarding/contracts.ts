import type { Group } from '$features/personnel/contracts';
import type { TrainingType } from '$features/training/contracts';
import type { Personnel } from '$lib/types';
import type { OnboardingTemplate, OnboardingTemplateStep, PersonnelOnboarding } from './onboarding.types';
export type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding,
	OnboardingStepType,
	OnboardingStepProgress,
	OnboardingStepNote,
	OnboardingStatus
} from './onboarding.types';

/** Only the active Personnel IDs needed for Calendar's onboarding markers. */
export interface OnboardingCalendarMarkersPort {
	listActivePersonnelIds(orgId: string): Promise<string[]>;
}

export const ONBOARDING_WORKSPACE_LANE_KEY = 'onboarding' as const;
export type OnboardingBootstrapMode = 'all' | 'active' | 'history';
export interface OnboardingBootstrap {
	onboardingTemplates: OnboardingTemplate[];
	onboardingTemplateSteps: OnboardingTemplateStep[];
	onboardings: PersonnelOnboarding[];
	personnel: Personnel[];
	groups: Group[];
	trainingTypes: TrainingType[];
}
export type OnboardingWorkspaceData = OnboardingBootstrap;
export type OnboardingWorkspaceHydrationMode = 'replace' | 'preserve-client';
export interface OnboardingWorkspaceHydrationTarget<T> {
	mode: OnboardingWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	items: T[] | Promise<T[]>;
}
export interface OnboardingTemplatesWorkspaceHydrationTarget {
	mode: OnboardingWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	templates: OnboardingTemplate[];
	steps: OnboardingTemplateStep[];
}
export interface OnboardingWorkspaceHydration {
	orgId: string;
	personnel: OnboardingWorkspaceHydrationTarget<Personnel>;
	groups: OnboardingWorkspaceHydrationTarget<Group>;
	trainingTypes: OnboardingWorkspaceHydrationTarget<TrainingType>;
	onboardingTemplates: OnboardingTemplatesWorkspaceHydrationTarget;
	onboardings: OnboardingWorkspaceHydrationTarget<PersonnelOnboarding>;
}
export interface OnboardingWorkspaceResult {
	laneKey: typeof ONBOARDING_WORKSPACE_LANE_KEY;
	data: OnboardingWorkspaceData;
	hydration: OnboardingWorkspaceHydration;
}
export interface OnboardingWorkspaceRouteData {
	[ONBOARDING_WORKSPACE_LANE_KEY]: {
		data: Promise<OnboardingWorkspaceResult>;
	};
}

// Onboarding feature barrel export

// Types
export type {
	OnboardingStepType,
	OnboardingStatus,
	OnboardingTemplate,
	OnboardingTemplateStep,
	OnboardingStepNote,
	OnboardingStepProgress,
	PersonnelOnboarding
} from './contracts';

// Stores
export { onboardingStore } from './stores/onboarding.svelte';
export { createOnboardingTemplateWorkspace, onboardingTemplateStore } from './stores/onboardingTemplate.svelte';
export type {
	OnboardingTemplateDeleteTarget,
	OnboardingTemplateWorkspaceAdapter,
	OnboardingTemplateWorkspaceData,
	OnboardingTemplateWorkspaceModel,
	OnboardingTemplateWorkspaceOrganization,
	OnboardingTemplateWorkspaceResult
} from './stores/onboardingTemplate.svelte';

// Context
export { OnboardingPageContext } from './contexts/OnboardingPageContext.svelte';
export type { AssignTemplatePayload } from './contexts/OnboardingPageContext.svelte';

export { onboardingWorkspaceHydrator } from './onboardingWorkspaceHydration.svelte';

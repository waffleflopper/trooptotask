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
export { OnboardingPageContext, MODAL_IDS } from './contexts/OnboardingPageContext.svelte';

export { onboardingWorkspaceHydrator } from './onboardingWorkspaceHydration.svelte';

export { default as OnboardingActiveView } from './components/OnboardingActiveView.svelte';
export { default as OnboardingHistoryPage } from './components/OnboardingHistoryPage.svelte';

/** Keep packet dialogs lazy behind their consumed Web entry. */
export function loadOnboardingModals() {
	return import('./components/OnboardingModals.svelte');
}

export type { OnboardingPageAccess } from './contracts';

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
} from './onboarding.types';

// Stores
export { onboardingStore } from './stores/onboarding.svelte';
export { onboardingTemplateStore } from './stores/onboardingTemplate.svelte';

// Context
export { OnboardingPageContext } from './contexts/OnboardingPageContext.svelte';
export type { AssignTemplatePayload } from './contexts/OnboardingPageContext.svelte';

// Components are imported directly from their paths:
// $features/onboarding/components/OnboardingTemplateManager.svelte
// $features/onboarding/components/OnboardingReportModal.svelte
// $features/onboarding/components/StartOnboardingModal.svelte
// $features/onboarding/components/OnboardingPageView.svelte
// $features/onboarding/components/OnboardingModals.svelte

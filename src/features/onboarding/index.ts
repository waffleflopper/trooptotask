// Onboarding feature barrel export

// Types
export type {
	OnboardingStepType,
	OnboardingStatus,
	OnboardingTemplateStep,
	OnboardingStepNote,
	OnboardingStepProgress,
	PersonnelOnboarding
} from './onboarding.types';

// Stores
export { onboardingStore } from './stores/onboarding.svelte';
export { onboardingTemplateStore } from './stores/onboardingTemplate.svelte';

// Components are imported directly from their paths:
// $features/onboarding/components/OnboardingTemplateManager.svelte
// $features/onboarding/components/OnboardingReportModal.svelte
// $features/onboarding/components/StartOnboardingModal.svelte

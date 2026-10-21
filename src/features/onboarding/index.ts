export type {
	OnboardingStepType,
	OnboardingStatus,
	OnboardingTemplate,
	OnboardingTemplateStep,
	OnboardingStepNote,
	OnboardingStepProgress,
	PersonnelOnboarding
} from './contracts';

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

export { OnboardingPageContext, MODAL_IDS } from './contexts/OnboardingPageContext.svelte';

export { default as TemplateHeader } from './components/templates/TemplateHeader.svelte';
export { default as TemplateSteps } from './components/templates/TemplateSteps.svelte';
export { default as TemplateSyncNotice } from './components/templates/TemplateSyncNotice.svelte';
export { describeTemplateSync, syncTemplatePackets } from './templateSync';
export { noteAuthorLookup } from './onboardingNoteAuthors';

export { onboardingWorkspaceHydrator } from './onboardingWorkspaceHydration.svelte';

export { default as OnboardingActiveView } from './components/OnboardingActiveView.svelte';
export { default as OnboardingHistoryPage } from './components/OnboardingHistoryPage.svelte';
export { default as PersonnelOnboardingLine } from './components/PersonnelOnboardingLine.svelte';

/** Keep packet dialogs lazy behind their consumed Web entry. */
export function loadOnboardingModals() {
	return import('./components/OnboardingModals.svelte');
}

export type { OnboardingPageAccess } from './contracts';

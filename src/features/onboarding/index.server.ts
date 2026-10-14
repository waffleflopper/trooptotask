export { createSupabaseOnboardingCalendarMarkersPort } from './server/calendarMarkers.server';
export type { OnboardingCalendarMarkersPort } from './contracts';

export {
	createOnboardingTemplate,
	updateOnboardingTemplate,
	deleteOnboardingTemplate,
	createOnboardingTemplateStep,
	updateOnboardingTemplateStep,
	deleteOnboardingTemplateStep,
	reorderOnboardingTemplateSteps,
	createStarterOnboardingTemplateStep
} from './server/onboardingTemplateOperations.server';
export {
	duplicateOnboardingTemplate,
	type DuplicateOnboardingTemplateResult
} from './server/onboardingTemplateDuplicate.server';
export { fetchOnboardingTemplateActivity, fetchOnboardingTemplatesData } from './server/onboardingTemplateRead.server';
export { createSupabaseOnboardingExportReader } from './server/onboardingExportRead.server';
export {
	fetchOnboardingWorkspace,
	type OnboardingWorkspaceBootstrapOptions
} from './server/onboardingWorkspaceBootstrap.server';

export { createSupabaseOnboardingRetentionSource } from './server/onboardingRetentionProvider.server';
export {
	cleanupExpiredOnboardings,
	type OnboardingRetentionCleanupResult,
	type OnboardingRetentionOrgConfig
} from './server/onboardingRetention.server';

export {
	startOnboarding,
	cancelOnboarding,
	reopenOnboarding,
	completeOnboarding
} from './server/onboardingLifecycle.server';
export { toggleCheckbox, advanceStage, addNote, removeInactiveStep } from './server/onboardingStepProgress.server';
export { resyncOnboarding, switchTemplate } from './server/onboardingResync.server';

export { createSupabaseOnboardingReconciliationPort } from './server/onboardingReconciliationProvider.server';

export { createSupabaseOnboardingNoteAppendPort } from './server/onboardingNoteAppendProvider.server';

export { createSupabaseOnboardingLifecycleTransitionPort } from './server/onboardingLifecycleProvider.server';

export { createSupabaseOnboardingInactiveStepRemovalPort } from './server/onboardingInactiveStepRemovalProvider.server';

export { createSupabaseOnboardingPacketCreationPort } from './server/onboardingPacketCreationProvider.server';

export { createOnboardingSupportReader } from './server/supportReadProvider.server';

export { createSupabaseOnboardingCatalogPersistence } from './server/onboardingCatalogPersistence.server';
export { createSupabaseOnboardingWorkflowPersistence } from './server/onboardingWorkflowPersistence.server';

export type { OnboardingTemplateWriteContext } from './server/onboardingTemplatePorts.server';

import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { TrainingOnboardingReferencesPort } from '$features/training/contracts';
import type { OnboardingCatalogPersistence, OnboardingWorkflowPersistence } from '../contracts';

export interface OnboardingTemplateReadContext {
	readonly auth: OrganizationAccessGrant;
	readonly onboardingCatalog: Pick<OnboardingCatalogPersistence, 'listTemplates' | 'listSteps'>;
}
export interface OnboardingTemplateActivityContext {
	readonly onboardingCatalog: Pick<OnboardingCatalogPersistence, 'listTemplates'>;
	readonly onboardingWorkflow: Pick<OnboardingWorkflowPersistence, 'countActivePacketsByTemplate'>;
}
export interface OnboardingTemplateWriteContext {
	readonly auth: OrganizationAccessGrant;
	readonly audit: PolicyAuditSink;
	readonly onboardingCatalog: Pick<
		OnboardingCatalogPersistence,
		| 'listTemplates'
		| 'listSteps'
		| 'findTemplate'
		| 'findTemplateByName'
		| 'findStep'
		| 'findStepByTemplateAndName'
		| 'createTemplate'
		| 'updateTemplate'
		| 'deleteTemplate'
		| 'createStep'
		| 'createSteps'
		| 'updateStep'
		| 'deleteStep'
		| 'deleteStepsForTemplate'
	>;
	readonly onboardingWorkflow: Pick<
		OnboardingWorkflowPersistence,
		'listPacketIdsUsingTemplate' | 'clearPacketTemplate'
	>;
	readonly trainingOnboardingReferences?: Pick<TrainingOnboardingReferencesPort, 'listTypes'>;
}

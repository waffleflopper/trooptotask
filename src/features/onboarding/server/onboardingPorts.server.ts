import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { FeatureKey } from '$lib/access/featureSwitches';
import type { OrganizationSettingsReader } from '$features/organization/contracts';
import type { PersonnelOnboardingRosterPort } from '$features/personnel/contracts';
import type { TrainingOnboardingReferencesPort } from '$features/training/contracts';
import type {
	OnboardingReconciliationPort,
	OnboardingNoteAppendPort,
	OnboardingLifecycleTransitionPort,
	OnboardingInactiveStepRemovalPort,
	OnboardingPacketCreationPort,
	OnboardingCatalogPersistence,
	OnboardingWorkflowPersistence
} from '../contracts';

export interface OnboardingPolicyPorts {
	readonly auth: OrganizationAccessGrant;
	readonly audit?: PolicyAuditSink;
}

export interface OnboardingResourcePorts extends OnboardingPolicyPorts {
	readonly onboardingWorkflow: Pick<OnboardingWorkflowPersistence, 'findPacketReference' | 'findStepReference'>;
	readonly personnelOnboardingRoster: Pick<PersonnelOnboardingRosterPort, 'findGroupIds'>;
}

export interface OnboardingReconciliationPorts extends OnboardingResourcePorts {
	readonly disabledFeatures: readonly FeatureKey[];
	readonly audit: PolicyAuditSink;
	readonly onboardingReconciliation?: OnboardingReconciliationPort;
}

export interface OnboardingNoteAppendPorts extends OnboardingResourcePorts {
	readonly audit: PolicyAuditSink;
	readonly onboardingNoteAppend?: OnboardingNoteAppendPort;
}

export interface OnboardingInactiveStepRemovalPorts extends OnboardingResourcePorts {
	readonly audit: PolicyAuditSink;
	readonly onboardingInactiveStepRemoval?: OnboardingInactiveStepRemovalPort;
}

export interface OnboardingLifecyclePorts extends OnboardingResourcePorts {
	readonly audit: PolicyAuditSink;
	readonly onboardingWorkflow: Pick<
		OnboardingWorkflowPersistence,
		'findPacketReference' | 'findStepReference' | 'listIncompleteActiveStepIds'
	>;
	readonly onboardingLifecycleTransition?: OnboardingLifecycleTransitionPort;
}

export interface OnboardingWorkflowPorts extends OnboardingResourcePorts {
	readonly audit: PolicyAuditSink;
	readonly disabledFeatures: readonly FeatureKey[];
	readonly onboardingWorkflow: Pick<
		OnboardingWorkflowPersistence,
		'findPacketReference' | 'findStepReference' | 'saveCheckboxCompletion' | 'savePaperworkProgress'
	>;
}

export interface OnboardingTrainingPorts extends OnboardingResourcePorts {
	readonly audit: PolicyAuditSink;
	readonly disabledFeatures: readonly FeatureKey[];
	readonly onboardingCatalog: Pick<OnboardingCatalogPersistence, 'listSteps'>;
	readonly onboardingWorkflow: Pick<
		OnboardingWorkflowPersistence,
		'findPacketReference' | 'findStepReference' | 'listActivePacketIdsForPersonnel'
	>;
	readonly onboardingPacketCreation?: OnboardingPacketCreationPort;
	readonly trainingOnboardingReferences: Pick<TrainingOnboardingReferencesPort, 'completedTypeIds'>;
}

export interface OnboardingQueryPorts extends OnboardingPolicyPorts {
	readonly disabledFeatures: readonly FeatureKey[];
	readonly onboardingCatalog: Pick<OnboardingCatalogPersistence, 'listTemplates' | 'listSteps'>;
	readonly onboardingWorkflow: Pick<OnboardingWorkflowPersistence, 'listPackets' | 'listCompletionsSince'>;
	/** Read as the viewer, so Organization Row Level Security decides which members and settings they see. */
	readonly organizationSettings: Pick<OrganizationSettingsReader, 'findMemberLabels' | 'findArchiveRetentionMonths'>;
	readonly loadRankCatalog: () => Promise<import('$features/personnel/contracts').OrganizationRankCatalogEntry[]>;
	readonly personnelOnboardingRoster: Pick<PersonnelOnboardingRosterPort, 'listRoster'>;
	readonly trainingOnboardingReferences: Pick<TrainingOnboardingReferencesPort, 'listTypes' | 'completedTypeIds'>;
}

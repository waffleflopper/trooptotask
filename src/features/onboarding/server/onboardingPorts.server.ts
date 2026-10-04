import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PersonnelOnboardingRosterPort } from '$features/personnel/contracts';
import type { TrainingOnboardingReferencesPort } from '$features/training/contracts';
import type {
	OnboardingReconciliationPort,
	OnboardingNoteAppendPort,
	OnboardingLifecycleTransitionPort,
	OnboardingInactiveStepRemovalPort,
	OnboardingPacketCreationPort
} from '../contracts';

export interface OnboardingReadStore {
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;
	findMany<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: {
			orderBy?: Array<{ column: string; ascending: boolean }>;
			inFilters?: Record<string, unknown[]>;
			select?: string;
		}
	): Promise<T[]>;
}

interface OnboardingWriteStore extends OnboardingReadStore {
	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;
}

export interface OnboardingPolicyPorts {
	readonly auth: OrganizationAccessGrant;
	readonly audit?: PolicyAuditSink;
}

export interface OnboardingResourcePorts extends OnboardingPolicyPorts {
	readonly store: Pick<OnboardingReadStore, 'findOne'>;
	/** Same authenticated request client; only explicit policy resource lookup bypasses Group filtering. */
	readonly rawStore?: Pick<OnboardingReadStore, 'findOne'>;
	readonly personnelOnboardingRoster: Pick<PersonnelOnboardingRosterPort, 'findGroupIds'>;
}

export interface OnboardingReconciliationPorts extends OnboardingResourcePorts {
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
	readonly store: OnboardingReadStore;
	readonly onboardingLifecycleTransition?: OnboardingLifecycleTransitionPort;
}

export interface OnboardingWorkflowPorts extends OnboardingResourcePorts {
	readonly audit: PolicyAuditSink;
	readonly store: OnboardingWriteStore;
}

export interface OnboardingTrainingPorts extends OnboardingResourcePorts {
	readonly audit: PolicyAuditSink;
	readonly store: OnboardingReadStore;
	readonly onboardingPacketCreation?: OnboardingPacketCreationPort;
	readonly trainingOnboardingReferences: Pick<TrainingOnboardingReferencesPort, 'completedTypeIds'>;
}

export interface OnboardingQueryPorts extends OnboardingPolicyPorts {
	readonly store: Pick<OnboardingReadStore, 'findMany'>;
	readonly rawStore?: Pick<OnboardingReadStore, 'findMany'>;
	readonly personnelOnboardingRoster: Pick<PersonnelOnboardingRosterPort, 'listRoster'>;
	readonly trainingOnboardingReferences: Pick<TrainingOnboardingReferencesPort, 'listTypes' | 'completedTypeIds'>;
}

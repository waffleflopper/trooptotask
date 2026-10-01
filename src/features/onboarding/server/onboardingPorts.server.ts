import type { requireFeaturePolicy } from '$lib/access/index.server';
import type { PersonnelOnboardingRosterPort } from '$features/personnel/contracts';
import type { TrainingOnboardingReferencesPort } from '$features/training/contracts';

type OnboardingActor = Parameters<typeof requireFeaturePolicy>[0]['auth'];
type OnboardingAudit = NonNullable<Parameters<typeof requireFeaturePolicy>[0]['audit']>;

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
	insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T>;
	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;
	delete(table: string, orgId: string, id: string): Promise<void>;
	insertMany<T>(table: string, orgId: string, rows: Record<string, unknown>[], select?: string): Promise<T[]>;
}

export interface OnboardingPolicyPorts {
	readonly auth: OnboardingActor;
	readonly audit?: OnboardingAudit;
}

export interface OnboardingResourcePorts extends OnboardingPolicyPorts {
	readonly store: Pick<OnboardingReadStore, 'findOne'>;
	/** Same authenticated request client; only explicit policy resource lookup bypasses Group filtering. */
	readonly rawStore?: Pick<OnboardingReadStore, 'findOne'>;
	readonly personnelOnboardingRoster: Pick<PersonnelOnboardingRosterPort, 'findGroupIds'>;
}

export interface OnboardingWorkflowPorts extends OnboardingResourcePorts {
	readonly audit: OnboardingAudit;
	readonly store: OnboardingWriteStore;
}

export interface OnboardingTrainingPorts extends OnboardingWorkflowPorts {
	readonly trainingOnboardingReferences: Pick<TrainingOnboardingReferencesPort, 'completedTypeIds'>;
}

export interface OnboardingQueryPorts extends OnboardingPolicyPorts {
	readonly store: Pick<OnboardingReadStore, 'findMany'>;
	readonly rawStore?: Pick<OnboardingReadStore, 'findMany'>;
	readonly personnelOnboardingRoster: Pick<PersonnelOnboardingRosterPort, 'listRoster'>;
	readonly trainingOnboardingReferences: Pick<TrainingOnboardingReferencesPort, 'listTypes' | 'completedTypeIds'>;
}

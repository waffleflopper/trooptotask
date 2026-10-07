import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { PersonnelTrainingRosterPort } from '$features/personnel/contracts';
import type { TrainingCatalogPersistence, TrainingCompletionPersistence } from '../contracts';

export type TrainingCompletionReadContext = {
	readonly auth: OrganizationAccessGrant;
	readonly audit?: PolicyAuditSink;
	readonly trainingCompletions: Pick<TrainingCompletionPersistence, 'listCompletions'>;
};
export type TrainingPersonnelWriteAuthority = {
	readonly auth: OrganizationAccessGrant;
	readonly audit: PolicyAuditSink;
	readonly personnelTrainingRoster?: Pick<PersonnelTrainingRosterPort, 'findGroupIdsForWrites'>;
};
export type TrainingRecordCreateContext = TrainingPersonnelWriteAuthority & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'findTypeTiming'>;
	readonly trainingCompletions: Pick<TrainingCompletionPersistence, 'findPair' | 'createRecord' | 'patchRecord'>;
};
export type TrainingRecordUpdateContext = TrainingPersonnelWriteAuthority & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'findTypeTiming'>;
	readonly trainingCompletions: Pick<TrainingCompletionPersistence, 'findResource' | 'patchRecord'>;
};
export type TrainingRecordDeleteContext = TrainingPersonnelWriteAuthority & {
	readonly trainingCompletions: Pick<TrainingCompletionPersistence, 'findResource' | 'deleteRecord'>;
};
export type TrainingBatchContext = TrainingPersonnelWriteAuthority & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'listTypeImportReferences' | 'findTypeId' | 'patchType'>;
	readonly trainingCompletions: Pick<TrainingCompletionPersistence, 'listPairReferences' | 'upsertCompleted'>;
};

import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { PersonnelTrainingRosterPort } from '$features/personnel/contracts';
import type { TrainingCatalogPersistence, TrainingCompletionPersistence } from '../contracts';

export interface TrainingCertificateStore {
	upload(personnelId: string, path: string, file: File): Promise<{ complete(): Promise<void> }>;
	/** The record id still naming an uploaded path, or null after retiring the unattached bytes. */
	reconcile(personnelId: string, path: string): Promise<string | null>;
	signedUrl(path: string, expiresInSeconds: number): Promise<string>;
}

export type TrainingCompletionReadContext = {
	readonly auth: OrganizationAccessGrant;
	readonly audit?: PolicyAuditSink;
	readonly trainingCompletions: Pick<TrainingCompletionPersistence, 'listCompletions' | 'listReadinessCompletions'>;
};
export type TrainingPersonnelWriteAuthority = {
	readonly auth: OrganizationAccessGrant;
	readonly audit: PolicyAuditSink;
	readonly personnelTrainingRoster?: Pick<PersonnelTrainingRosterPort, 'findWriteSubjects'>;
};
export type TrainingRecordCreateContext = TrainingPersonnelWriteAuthority & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'findTypeTiming'>;
	readonly trainingCompletions: Pick<TrainingCompletionPersistence, 'findPair' | 'createRecord' | 'patchRecord'>;
};
export type TrainingCompletionRecordContext = TrainingRecordCreateContext & {
	readonly trainingCertificates: Pick<TrainingCertificateStore, 'upload' | 'reconcile'>;
};
export type TrainingCompletionRecordInput = Record<string, unknown> & { certificate?: File };
export type TrainingCompletionEntryContext = TrainingPersonnelWriteAuthority & {
	readonly trainingCompletions: Pick<TrainingCompletionPersistence, 'findEntry'>;
};
export type TrainingCompletionCorrectionContext = TrainingPersonnelWriteAuthority & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'findTypeTiming'>;
	readonly trainingCompletions: Pick<TrainingCompletionPersistence, 'findEntry' | 'correctEntry'>;
};
export type TrainingCertificateOpenContext = TrainingCompletionEntryContext & {
	readonly trainingCertificates: Pick<TrainingCertificateStore, 'signedUrl'>;
};
export type TrainingRecordUpdateContext = TrainingPersonnelWriteAuthority & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'findTypeTiming'>;
	readonly trainingCompletions: Pick<TrainingCompletionPersistence, 'findResource' | 'patchRecord'>;
};
export type TrainingRecordDeleteContext = TrainingPersonnelWriteAuthority & {
	readonly trainingCompletions: Pick<TrainingCompletionPersistence, 'findResource' | 'deleteRecord'>;
};
export type TrainingRecordDeletionRequestContext = TrainingPersonnelWriteAuthority & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'listTypeLabels'>;
	readonly trainingCompletions: Pick<TrainingCompletionPersistence, 'findResource'>;
};
export type TrainingBatchContext = TrainingPersonnelWriteAuthority & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'listTypeImportReferences' | 'findTypeId' | 'patchType'>;
	readonly trainingCompletions: Pick<TrainingCompletionPersistence, 'listPairReferences' | 'upsertCompleted'>;
};

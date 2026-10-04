import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PersonnelTrainingRosterPort } from '$features/personnel/contracts';
import type { TrainingCatalogReadStore } from './trainingCatalogPorts.server';

export interface TrainingCompletionReadContext {
	readonly auth: OrganizationAccessGrant;
	readonly audit?: PolicyAuditSink;
	readonly store: Pick<TrainingCatalogReadStore, 'findMany'>;
}

interface TrainingCompletionWriteStore extends Pick<TrainingCatalogReadStore, 'findOne' | 'findMany'> {
	insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T>;
	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;
	delete(table: string, orgId: string, id: string): Promise<void>;
	upsertMany<T>(
		table: string,
		orgId: string,
		rows: Record<string, unknown>[],
		options: { onConflict: string; select?: string }
	): Promise<T[]>;
}

export interface TrainingCompletionWriteContext extends TrainingCompletionReadContext {
	readonly audit: PolicyAuditSink;
	readonly store: TrainingCompletionWriteStore;
	readonly personnelTrainingRoster?: Pick<PersonnelTrainingRosterPort, 'findGroupIdsForWrites'>;
}

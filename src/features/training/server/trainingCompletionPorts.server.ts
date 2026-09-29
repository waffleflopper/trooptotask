import type { requireFeaturePolicy } from '$lib/access/index.server';
import type { PersonnelTrainingRosterPort } from '$features/personnel/contracts';
import type { TrainingCatalogReadStore } from './trainingCatalogPorts.server';

type TrainingCompletionActor = Parameters<typeof requireFeaturePolicy>[0]['auth'];
type TrainingCompletionAudit = NonNullable<Parameters<typeof requireFeaturePolicy>[0]['audit']>;

export interface TrainingCompletionReadContext {
	readonly auth: TrainingCompletionActor;
	readonly audit?: TrainingCompletionAudit;
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
	readonly audit: TrainingCompletionAudit;
	readonly store: TrainingCompletionWriteStore;
	readonly personnelTrainingRoster?: Pick<PersonnelTrainingRosterPort, 'findGroupIdsForWrites'>;
}

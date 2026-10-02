import type { TrainingCatalogReadStore } from './trainingCatalogPorts.server';

type TrainingExportReadStore = Pick<TrainingCatalogReadStore, 'findMany'>;

/** Raw saved rows for separately authorized exports; the request store retains its RLS. */
export function listTrainingTypeExportRows(
	store: TrainingExportReadStore,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('training_types', orgId);
}

export function listTrainingCompletionExportRows(
	store: TrainingExportReadStore,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('personnel_trainings', orgId);
}

export function listTrainingViewExportRows(
	store: TrainingExportReadStore,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('training_views', orgId);
}

export function listPersonnelTrainingExportRows(
	store: TrainingExportReadStore,
	orgId: string,
	personnelId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('personnel_trainings', orgId, { personnel_id: personnelId });
}

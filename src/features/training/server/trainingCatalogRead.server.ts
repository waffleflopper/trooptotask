import type { TrainingType, TrainingView } from '../contracts';
import { TrainingTypeEntity } from './trainingTypeEntity.server';
import { TrainingViewEntity } from './trainingViewEntity.server';
import type { TrainingCatalogReadStore } from './trainingCatalogPorts.server';

/** The caller supplies its own authorized, Organization-scoped request store. */
export async function listTrainingTypes(store: TrainingCatalogReadStore, orgId: string): Promise<TrainingType[]> {
	const rows = await store.findMany<Record<string, unknown>>('training_types', orgId, undefined, {
		orderBy: [{ column: 'sort_order', ascending: true }]
	});
	return TrainingTypeEntity.fromDbArray(rows);
}

export async function listTrainingViews(store: TrainingCatalogReadStore, orgId: string): Promise<TrainingView[]> {
	const rows = await store.findMany<Record<string, unknown>>('training_views', orgId, undefined, {
		orderBy: [{ column: 'name', ascending: true }]
	});
	return TrainingViewEntity.fromDbArray(rows);
}

/** Labels for authorized exports that need Training names without catalog configuration fields. */
export async function listTrainingTypeLabels(
	store: TrainingCatalogReadStore,
	orgId: string
): Promise<Array<{ id: string; name: string }>> {
	const rows = await store.findMany<{ id: string; name: string }>('training_types', orgId, {}, { select: 'id, name' });
	return rows.map(({ id, name }) => ({ id, name }));
}

/** Rank catalog deletion needs only Training's active applicability references. */
export async function listTrainingRankApplicabilityReferences(
	store: TrainingCatalogReadStore,
	orgId: string
): Promise<Array<{ appliesToRanks: unknown; excludedRanks: unknown }>> {
	const rows = await store.findMany<{ applies_to_ranks?: unknown; excluded_ranks?: unknown }>(
		'training_types',
		orgId,
		undefined,
		{ select: 'applies_to_ranks, excluded_ranks' }
	);
	return rows.map((row) => ({ appliesToRanks: row.applies_to_ranks, excludedRanks: row.excluded_ranks }));
}

/** The existing getting-started numeric count, using its authorized request store. */
export async function countTrainingTypes(store: TrainingCatalogReadStore, orgId: string): Promise<number> {
	const result = await store.findManyWithCount<{ id: string }>('training_types', orgId, undefined, {
		select: 'id',
		range: { from: 0, to: 0 },
		count: 'estimated'
	});
	return result.count ?? 0;
}

export async function findTrainingTypeByName(
	store: TrainingCatalogReadStore,
	orgId: string,
	name: string
): Promise<TrainingType | null> {
	const row = await store.findOne<Record<string, unknown>>('training_types', orgId, { name });
	return row ? TrainingTypeEntity.fromDb(row) : null;
}

/** Narrow starter-pack read: names only, restricted to the requested names. */
export async function listExistingTrainingTypeNames(
	store: TrainingCatalogReadStore,
	orgId: string,
	names: string[]
): Promise<string[]> {
	if (names.length === 0) return [];
	const rows = await store.findMany<{ name: string }>(
		'training_types',
		orgId,
		{},
		{
			inFilters: { name: names },
			select: 'name'
		}
	);
	return rows.map((row) => row.name);
}

/** A single-row existence check for starter-pack readiness. */
export async function hasTrainingTypes(store: TrainingCatalogReadStore, orgId: string): Promise<boolean> {
	const rows = await store.findMany<{ id: string }>('training_types', orgId, {}, { select: 'id', limit: 1 });
	return rows.length > 0;
}

import type {
	CriticalTaskLibraryPersistence,
	CriticalTaskCompletionPersistence,
	CriticalTasksReadModelFilters,
	CriticalTasksReadModelPort
} from '../contracts';
import type { CriticalTasksReadStore } from './criticalTasksReadPorts.server';
import { buildLatestIctCompletionLookup } from '../utils/ictReadinessSnapshot';

interface PersonnelRow {
	id: string;
	archived_at: string | null;
}

function hasEmptyFilter(values?: string[]): boolean {
	return Array.isArray(values) && values.length === 0;
}

function normalizeIds(values?: string[]): string[] | undefined {
	if (!values || values.length === 0) return undefined;
	return [...new Set(values)];
}

async function loadActiveScope(
	store: Pick<CriticalTasksReadStore, 'findMany'>,
	criticalTaskLibrary: Pick<CriticalTaskLibraryPersistence, 'listCatalog'>,
	orgId: string,
	filters: CriticalTasksReadModelFilters
): Promise<{
	personnelIds: Set<string>;
	taskIds: Set<string>;
}> {
	const personnelIdFilter = normalizeIds(filters.personnelIds);
	const taskIdFilter = normalizeIds(filters.taskIds);

	const [personnelRows, taskRows] = await Promise.all([
		store.findMany<PersonnelRow>('personnel', orgId, undefined, {
			isNull: { archived_at: true },
			...(personnelIdFilter ? { inFilters: { id: personnelIdFilter } } : {})
		}),
		criticalTaskLibrary.listCatalog()
	]);

	return {
		personnelIds: new Set(personnelRows.map((row) => row.id)),
		taskIds: new Set(taskRows.filter((row) => !taskIdFilter || taskIdFilter.includes(row.id)).map((row) => row.id))
	};
}

export function createInMemoryCriticalTasksReadModelAdapter(
	store: Pick<CriticalTasksReadStore, 'findMany'>,
	criticalTaskLibrary: Pick<CriticalTaskLibraryPersistence, 'listCatalog'>,
	criticalTaskCompletions: Pick<CriticalTaskCompletionPersistence, 'listReportHistory'>
): CriticalTasksReadModelPort {
	return {
		async findLatestCompletions(orgId: string, filters: CriticalTasksReadModelFilters = {}) {
			if (hasEmptyFilter(filters.personnelIds) || hasEmptyFilter(filters.taskIds)) {
				return [];
			}

			const { personnelIds, taskIds } = await loadActiveScope(store, criticalTaskLibrary, orgId, filters);
			if (personnelIds.size === 0 || taskIds.size === 0) {
				return [];
			}

			const completions = await criticalTaskCompletions.listReportHistory({
				personnelIds: [...personnelIds],
				taskIds: [...taskIds]
			});
			return [...buildLatestIctCompletionLookup(completions).values()];
		}
	};
}

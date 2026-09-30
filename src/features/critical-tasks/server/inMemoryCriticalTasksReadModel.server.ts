import type { CriticalTasksReadModelFilters, CriticalTasksReadModelPort } from '../contracts';
import type { CriticalTasksReadStore } from './criticalTasksReadPorts.server';
import { PersonnelIctCompletionEntity } from './personnelIctCompletionEntity.server';
import { buildLatestIctCompletionLookup } from '../utils/ictReadinessSnapshot';

interface PersonnelRow {
	id: string;
	archived_at: string | null;
}

interface IctTaskRow {
	id: string;
	archived_at: string | null;
}

interface PersonnelIctCompletionRow extends Record<string, unknown> {
	id: string;
	personnel_id: string;
	ict_task_id: string;
	completed_at: string;
	created_at: string;
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
		store.findMany<IctTaskRow>('ict_tasks', orgId, undefined, {
			isNull: { archived_at: true },
			...(taskIdFilter ? { inFilters: { id: taskIdFilter } } : {})
		})
	]);

	return {
		personnelIds: new Set(personnelRows.map((row) => row.id)),
		taskIds: new Set(taskRows.map((row) => row.id))
	};
}

export function createInMemoryCriticalTasksReadModelAdapter(
	store: Pick<CriticalTasksReadStore, 'findMany'>
): CriticalTasksReadModelPort {
	return {
		async findLatestCompletions(orgId: string, filters: CriticalTasksReadModelFilters = {}) {
			if (hasEmptyFilter(filters.personnelIds) || hasEmptyFilter(filters.taskIds)) {
				return [];
			}

			const { personnelIds, taskIds } = await loadActiveScope(store, orgId, filters);
			if (personnelIds.size === 0 || taskIds.size === 0) {
				return [];
			}

			const completionRows = await store.findMany<PersonnelIctCompletionRow>(
				'personnel_ict_completions',
				orgId,
				undefined,
				{
					inFilters: {
						personnel_id: [...personnelIds],
						ict_task_id: [...taskIds]
					}
				}
			);

			const completions = PersonnelIctCompletionEntity.fromDbArray(completionRows);
			return [...buildLatestIctCompletionLookup(completions).values()];
		}
	};
}

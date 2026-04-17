import type {
	CriticalTasksCompletionTrendPoint,
	CriticalTasksReadModelFilters,
	CriticalTasksReadModelPort,
	DataStore
} from '../core/ports';
import { isIctTaskApplicableToMos } from '$features/critical-tasks/utils/ictTaskLibrary';

interface PersonnelRow {
	id: string;
	archived_at: string | null;
	mos: string | null;
}

interface IctTaskRow {
	id: string;
	archived_at: string | null;
	mos: string[] | null;
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

function compareCompletionRecency(a: PersonnelIctCompletionRow, b: PersonnelIctCompletionRow): number {
	const completedAtDiff = a.completed_at.localeCompare(b.completed_at);
	if (completedAtDiff !== 0) {
		return completedAtDiff;
	}

	return a.created_at.localeCompare(b.created_at);
}

async function loadActiveScope(
	store: DataStore,
	orgId: string,
	filters: CriticalTasksReadModelFilters
): Promise<{
	personnelById: Map<string, PersonnelRow>;
	taskById: Map<string, IctTaskRow>;
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

	const personnelById = new Map(personnelRows.map((row) => [row.id, row]));
	const taskById = new Map(taskRows.map((row) => [row.id, row]));

	return {
		personnelById,
		taskById,
		personnelIds: new Set(personnelById.keys()),
		taskIds: new Set(taskById.keys())
	};
}

export function createInMemoryCriticalTasksReadModelAdapter(store: DataStore): CriticalTasksReadModelPort {
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

			const latestByKey = new Map<string, PersonnelIctCompletionRow>();
			for (const completion of completionRows) {
				const key = `${completion.personnel_id}:${completion.ict_task_id}`;
				const existing = latestByKey.get(key);
				if (!existing || compareCompletionRecency(existing, completion) < 0) {
					latestByKey.set(key, completion);
				}
			}

			return [...latestByKey.values()];
		},

		async findCompletionTrend(
			orgId: string,
			filters: CriticalTasksReadModelFilters = {}
		): Promise<CriticalTasksCompletionTrendPoint[]> {
			if (hasEmptyFilter(filters.personnelIds) || hasEmptyFilter(filters.taskIds)) {
				return [];
			}

			const { personnelById, taskById, personnelIds, taskIds } = await loadActiveScope(store, orgId, filters);
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

			const counts = new Map<string, number>();
			for (const completion of completionRows) {
				const person = personnelById.get(completion.personnel_id);
				const task = taskById.get(completion.ict_task_id);
				if (!person || !task || !isIctTaskApplicableToMos({ mos: task.mos ?? [] }, person.mos)) {
					continue;
				}

				const month = completion.completed_at.slice(0, 7);
				counts.set(month, (counts.get(month) ?? 0) + 1);
			}

			return [...counts.entries()]
				.map(([month, completions]) => ({ month, completions }))
				.sort((left, right) => left.month.localeCompare(right.month));
		}
	};
}

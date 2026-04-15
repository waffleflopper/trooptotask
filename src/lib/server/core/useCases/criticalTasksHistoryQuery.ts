import type { CriticalTasksPersonnelHistoryData } from '$features/critical-tasks/criticalTasks.types';
import { IctTaskEntity } from '$lib/server/entities/ictTask';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { PersonnelIctCompletionEntity } from '$lib/server/entities/personnelIctCompletion';
import type { QueryPorts } from '$lib/server/core/ports';
import { fail } from '$lib/server/core/errors';

export async function fetchCriticalTasksPersonnelHistory(
	ctx: QueryPorts,
	personnelId: string
): Promise<CriticalTasksPersonnelHistoryData> {
	const personnelRow = await ctx.store.findOne<Record<string, unknown>>(
		'personnel',
		ctx.auth.orgId,
		{ id: personnelId },
		PersonnelEntity.select
	);

	if (!personnelRow) {
		fail(404, 'Personnel record not found');
	}

	const completionRows = await ctx.store.findMany<Record<string, unknown>>(
		'personnel_ict_completions',
		ctx.auth.orgId,
		{ personnel_id: personnelId },
		{ orderBy: [{ column: 'completed_at', ascending: false }] }
	);
	const completions = PersonnelIctCompletionEntity.fromDbArray(completionRows);
	const taskIds = [...new Set(completions.map((completion) => completion.ictTaskId))];
	const taskRows =
		taskIds.length === 0
			? []
			: await ctx.store.findMany<Record<string, unknown>>('ict_tasks', ctx.auth.orgId, undefined, {
					inFilters: { id: taskIds },
					orderBy: [
						{ column: 'sort_order', ascending: true },
						{ column: 'task_code', ascending: true }
					]
				});
	const tasksById = new Map(IctTaskEntity.fromDbArray(taskRows).map((task) => [task.id, task]));

	return {
		personnel: PersonnelEntity.fromDb(personnelRow),
		rows: completions.map((completion) => {
			const task = tasksById.get(completion.ictTaskId) ?? null;
			return {
				completion,
				task,
				taskCode: task?.taskCode ?? 'Unknown task',
				taskTitle: task?.title ?? 'Task definition unavailable',
				taskArchivedAt: task?.archivedAt ?? null
			};
		})
	};
}

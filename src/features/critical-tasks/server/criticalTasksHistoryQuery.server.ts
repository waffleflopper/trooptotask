import type { CriticalTasksPersonnelHistoryData } from '$features/critical-tasks/contracts';
import { IctTaskEntity } from './ictTaskEntity.server';
import { PersonnelIctCompletionEntity } from './personnelIctCompletionEntity.server';
import type { CriticalTasksHistoryContext } from './criticalTasksReadPorts.server';

export async function fetchCriticalTasksPersonnelHistory(
	ctx: CriticalTasksHistoryContext,
	personnelId: string
): Promise<CriticalTasksPersonnelHistoryData> {
	if (!ctx.personnelCriticalTasksRoster) throw new Error('Personnel Critical Tasks roster provider unavailable');
	const personnel = await ctx.personnelCriticalTasksRoster.findForHistory(ctx.auth, personnelId);

	if (!personnel) {
		throw Object.assign(new Error('Personnel record not found'), { status: 404 });
	}

	const completionRows = await ctx.store.findMany<Record<string, unknown>>(
		'personnel_ict_completions',
		ctx.auth.orgId,
		{ personnel_id: personnelId },
		{
			// A unique tie-break keeps equal-date captures on stable provider pages.
			orderBy: [
				{ column: 'completed_at', ascending: false },
				{ column: 'id', ascending: true }
			]
		}
	);
	const completions = PersonnelIctCompletionEntity.fromDbArray(completionRows);
	const taskIds = [...new Set(completions.map((completion) => completion.ictTaskId))];
	const taskRows: Record<string, unknown>[] = [];
	// Referenced history may span a large catalog, including archived definitions.
	// Bound metadata filters without changing the completion history order.
	for (let index = 0; index < taskIds.length; index += 200) {
		const windows: Array<Promise<Record<string, unknown>[]>> = [];
		for (let offset = index; offset < Math.min(index + 200, taskIds.length); offset += 50) {
			windows.push(
				ctx.store.findMany<Record<string, unknown>>('ict_tasks', ctx.auth.orgId, undefined, {
					inFilters: { id: taskIds.slice(offset, offset + 50) },
					orderBy: [
						{ column: 'sort_order', ascending: true },
						{ column: 'task_code', ascending: true }
					]
				})
			);
		}
		taskRows.push(...(await Promise.all(windows)).flat());
	}

	const tasksById = new Map(IctTaskEntity.fromDbArray(taskRows).map((task) => [task.id, task]));

	return {
		personnel,
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

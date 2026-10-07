import type { CriticalTasksPersonnelHistoryData } from '$features/critical-tasks/contracts';
import type { CriticalTasksHistoryContext } from './criticalTasksReadPorts.server';
import { RequestFailure } from '$lib/errors';

export async function fetchCriticalTasksPersonnelHistory(
	ctx: CriticalTasksHistoryContext,
	personnelId: string
): Promise<CriticalTasksPersonnelHistoryData> {
	if (!ctx.personnelCriticalTasksRoster) throw new Error('Personnel Critical Tasks roster provider unavailable');
	const personnel = await ctx.personnelCriticalTasksRoster.findForHistory(ctx.auth, personnelId);

	if (!personnel) {
		throw new RequestFailure(404, 'Personnel record not found');
	}

	const completions = await ctx.criticalTaskCompletions.listHistory(personnelId);
	const taskIds = [...new Set(completions.map((completion) => completion.ictTaskId))];
	const tasks = await ctx.criticalTaskLibrary.listReferenced(taskIds);
	const tasksById = new Map(tasks.map((task) => [task.id, task]));

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

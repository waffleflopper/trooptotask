import {
	ICT_TASK_ORDER_MAX_CHANGES,
	ICT_TASK_SORT_ORDER_MAX,
	type IctTask,
	type IctTaskOrderChange,
	type PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';

function normalizeMos(value: string): string {
	return value.trim().toUpperCase();
}

export function parseMosApplicabilityInput(value: string): string[] {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const entry of value.split(/[\n,]/)) {
		const normalized = normalizeMos(entry);
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		result.push(normalized);
	}

	return result;
}

export function isIctTaskApplicableToMos(task: Pick<IctTask, 'mos'>, personnelMos: string | null | undefined): boolean {
	if (task.mos.length === 0) return true;
	const normalizedPersonnelMos = normalizeMos(personnelMos ?? '');
	if (!normalizedPersonnelMos) return false;

	return task.mos.some((mos) => normalizeMos(mos) === normalizedPersonnelMos);
}

export function getActiveIctTasksForLibrary(tasks: IctTask[]): IctTask[] {
	return [...tasks].filter((task) => !task.archivedAt).sort(sortIctTasksForLibrary);
}

export function getArchivedIctTasksForLibrary(tasks: IctTask[]): IctTask[] {
	return [...tasks].filter((task) => Boolean(task.archivedAt)).sort(sortIctTasksForLibrary);
}

function sortIctTasksForLibrary(a: IctTask, b: IctTask): number {
	return a.sortOrder - b.sortOrder || a.taskCode.localeCompare(b.taskCode);
}

export type IctTaskMovePlan = { status: 'ready'; changes: IctTaskOrderChange[] } | { status: 'unsupported' };

/**
 * Plans swapping a task with its neighbour in the displayed active order. Each position keeps the sort order
 * already shown there; a shared or crowded value is raised just enough that the saved order matches the display.
 * Unchanged swap participants and adjacent span boundaries guard the order used to plan the move.
 * A move that would need more participants, or a larger sort order, than one command may carry is unsupported.
 */
export function planIctTaskMove(activeTasks: IctTask[], index: number, direction: -1 | 1): IctTaskMovePlan {
	const neighbour = index + direction;
	if (!activeTasks[index] || !activeTasks[neighbour]) return { status: 'ready', changes: [] };
	const desired = [...activeTasks];
	[desired[index], desired[neighbour]] = [desired[neighbour], desired[index]];

	const changes: IctTaskOrderChange[] = [];
	let lastAffected = Math.max(index, neighbour);
	let previous: { task: IctTask; sortOrder: number } | null = null;
	desired.forEach((task, position) => {
		const floor = previous ? previous.sortOrder + (previous.task.taskCode.localeCompare(task.taskCode) < 0 ? 0 : 1) : 0;
		const sortOrder = Math.max(activeTasks[position].sortOrder, floor);
		if (sortOrder !== task.sortOrder) lastAffected = Math.max(lastAffected, position);
		changes.push({ id: task.id, expectedSortOrder: task.sortOrder, sortOrder });
		previous = { task, sortOrder };
	});
	const participants = changes.slice(Math.max(0, Math.min(index, neighbour) - 1), lastAffected + 2);
	const withinBounds =
		participants.length <= ICT_TASK_ORDER_MAX_CHANGES &&
		participants.every((change) => change.sortOrder <= ICT_TASK_SORT_ORDER_MAX);
	return withinBounds ? { status: 'ready', changes: participants } : { status: 'unsupported' };
}

export function countCompletionRecordsForTask(completions: PersonnelIctCompletion[], taskId: string): number {
	return completions.filter((completion) => completion.ictTaskId === taskId).length;
}

export function formatMosApplicability(mos: string[]): string {
	return mos.length === 0 ? 'All MOSs' : mos.join(', ');
}

import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';

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
	const sortOrderCompare = a.sortOrder - b.sortOrder;
	if (sortOrderCompare !== 0) return sortOrderCompare;
	return a.taskCode.localeCompare(b.taskCode);
}

export function countCompletionRecordsForTask(completions: PersonnelIctCompletion[], taskId: string): number {
	return completions.filter((completion) => completion.ictTaskId === taskId).length;
}

export function formatMosApplicability(mos: string[]): string {
	return mos.length === 0 ? 'All MOSs' : mos.join(', ');
}

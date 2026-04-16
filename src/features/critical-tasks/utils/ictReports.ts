import type {
	CriticalTasksSettingsInput,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';
import type { Personnel } from '$lib/types';
import { getIctStatus } from './ictStatus';
import { getActiveIctTasksForLibrary, isIctTaskApplicableToMos } from './ictTaskLibrary';

export interface IctReportFilters {
	groupId?: string;
	mos?: string;
	role?: string;
	rank?: string;
}

export interface BuildIctReportSummaryInput {
	personnel: Personnel[];
	tasks: IctTask[];
	completions: PersonnelIctCompletion[];
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
}

export interface IctMosReadinessSummary {
	mos: string;
	readinessPercent: number;
	applicableCount: number;
	readyCount: number;
}

export interface IctCompletionTrendPoint {
	month: string;
	completions: number;
}

export interface IctReportSummary {
	overallReadinessPercent: number;
	readinessByMos: IctMosReadinessSummary[];
	bestPerformingMos?: IctMosReadinessSummary;
	worstPerformingMos?: IctMosReadinessSummary;
	completionTrend: IctCompletionTrendPoint[];
}

function completionKey(personnelId: string, ictTaskId: string): string {
	return `${personnelId}:${ictTaskId}`;
}

function compareCompletionRecency(a: PersonnelIctCompletion, b: PersonnelIctCompletion): number {
	const completedAtDiff = a.completedAt.localeCompare(b.completedAt);
	if (completedAtDiff !== 0) {
		return completedAtDiff;
	}

	return a.createdAt.localeCompare(b.createdAt);
}

function buildLatestCompletionLookup(completions: PersonnelIctCompletion[]): Map<string, PersonnelIctCompletion> {
	const lookup = new Map<string, PersonnelIctCompletion>();
	for (const completion of completions) {
		const key = completionKey(completion.personnelId, completion.ictTaskId);
		const existing = lookup.get(key);
		if (!existing || compareCompletionRecency(existing, completion) < 0) {
			lookup.set(key, completion);
		}
	}

	return lookup;
}

function computeReadinessPercent(readyCount: number, applicableCount: number): number {
	if (applicableCount === 0) {
		return 0;
	}

	return Math.round((readyCount / applicableCount) * 100);
}

function buildCompletionTrend(
	personnel: Personnel[],
	tasks: IctTask[],
	completions: PersonnelIctCompletion[]
): IctCompletionTrendPoint[] {
	const personnelById = new Map(personnel.map((person) => [person.id, person]));
	const tasksById = new Map(tasks.map((task) => [task.id, task]));
	const monthCounts = new Map<string, number>();

	for (const completion of completions) {
		const person = personnelById.get(completion.personnelId);
		const task = tasksById.get(completion.ictTaskId);
		if (!person || person.archivedAt || !task || task.archivedAt) {
			continue;
		}

		if (!isIctTaskApplicableToMos(task, person.mos)) {
			continue;
		}

		const month = completion.completedAt.slice(0, 7);
		monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
	}

	return [...monthCounts.entries()]
		.map(([month, completions]) => ({ month, completions }))
		.sort((left, right) => left.month.localeCompare(right.month));
}

export function filterIctReportPersonnel(personnel: Personnel[], filters: IctReportFilters): Personnel[] {
	return personnel.filter((person) => {
		if (person.archivedAt) return false;
		if (filters.groupId && person.groupId !== filters.groupId) return false;
		if (filters.mos && person.mos !== filters.mos) return false;
		if (filters.role && person.clinicRole !== filters.role) return false;
		if (filters.rank && person.rank !== filters.rank) return false;
		return true;
	});
}

export function buildIctReportSummary({
	personnel,
	tasks,
	completions,
	settings = null,
	asOf
}: BuildIctReportSummaryInput): IctReportSummary {
	const activeTasks = getActiveIctTasksForLibrary(tasks);
	const latestCompletions = buildLatestCompletionLookup(completions);
	const readinessByMosMap = new Map<string, { applicableCount: number; readyCount: number }>();
	let applicableCount = 0;
	let readyCount = 0;

	for (const person of personnel) {
		if (person.archivedAt) {
			continue;
		}

		const mos = person.mos.trim() || 'Unknown';
		for (const task of activeTasks) {
			if (!isIctTaskApplicableToMos(task, person.mos)) {
				continue;
			}

			applicableCount += 1;
			const mosSummary = readinessByMosMap.get(mos) ?? { applicableCount: 0, readyCount: 0 };
			mosSummary.applicableCount += 1;
			const completion = latestCompletions.get(completionKey(person.id, task.id));
			const status = getIctStatus(completion?.completedAt ?? null, task, settings, asOf).status;
			if (status === 'current' || status === 'expiring-soon') {
				readyCount += 1;
				mosSummary.readyCount += 1;
			}
			readinessByMosMap.set(mos, mosSummary);
		}
	}

	const readinessByMos = [...readinessByMosMap.entries()]
		.map(([mos, counts]) => ({
			mos,
			applicableCount: counts.applicableCount,
			readyCount: counts.readyCount,
			readinessPercent: computeReadinessPercent(counts.readyCount, counts.applicableCount)
		}))
		.sort((left, right) => left.mos.localeCompare(right.mos));
	const byBest = [...readinessByMos].sort(
		(left, right) =>
			right.readinessPercent - left.readinessPercent ||
			right.readyCount - left.readyCount ||
			left.mos.localeCompare(right.mos)
	);
	const byWorst = [...readinessByMos].sort(
		(left, right) =>
			left.readinessPercent - right.readinessPercent ||
			left.readyCount - right.readyCount ||
			left.mos.localeCompare(right.mos)
	);

	return {
		overallReadinessPercent: computeReadinessPercent(readyCount, applicableCount),
		readinessByMos,
		bestPerformingMos: byBest[0],
		worstPerformingMos: byWorst[0],
		completionTrend: buildCompletionTrend(personnel, activeTasks, completions)
	};
}

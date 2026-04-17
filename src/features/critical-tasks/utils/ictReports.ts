import type {
	CriticalTasksSettingsInput,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';
import type { Personnel } from '$lib/types';
import { calculateIctExpirationDate, getIctStatus } from './ictStatus';
import { getActiveIctTasksForLibrary, isIctTaskApplicableToMos } from './ictTaskLibrary';
import { formatDate, parseDate } from '$lib/utils/dates';

const READINESS_THRESHOLD_PERCENT = 70;
const EXPIRING_SOON_WINDOW_DAYS = 30;

export interface IctReportFilters {
	groupId?: string;
	mos?: string | string[];
	role?: string;
	rank?: string;
}

export interface BuildIctReportSummaryInput {
	personnel: Personnel[];
	tasks: IctTask[];
	completions: PersonnelIctCompletion[];
	completionTrend?: IctCompletionTrendPoint[];
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

export interface IctTaskBelowThresholdRow {
	taskId: string;
	taskCode: string;
	taskName: string;
	percentComplete: number;
	soldierGapCount: number;
	applicableCount: number;
	completeCount: number;
}

export interface IctReportSummary {
	overallReadinessPercent: number;
	readinessByMos: IctMosReadinessSummary[];
	bestPerformingMos?: IctMosReadinessSummary;
	worstPerformingMos?: IctMosReadinessSummary;
	completionTrend: IctCompletionTrendPoint[];
}

export interface IctReportDashboard {
	kpis: {
		overallReadiness: {
			percent: number;
			deltaPercent: number;
			readyCount: number;
			applicableCount: number;
		};
		soldiersBelow70: {
			count: number;
			totalAssigned: number;
			thresholdPercent: number;
		};
		tasksExpiringSoon: {
			count: number;
			affectedSoldiers: number;
			windowDays: number;
		};
		tasksBelowThreshold: {
			count: number;
			thresholdPercent: number;
		};
	};
	tasksBelowThreshold: {
		thresholdPercent: number;
		rows: IctTaskBelowThresholdRow[];
	};
}

interface ReadinessSnapshot {
	percent: number;
	readyCount: number;
	applicableCount: number;
	soldiersBelowThresholdCount: number;
	tasksBelowThresholdRows: IctTaskBelowThresholdRow[];
	latestCompletions: Map<string, PersonnelIctCompletion>;
}

interface TaskReadinessSummary {
	task: IctTask;
	applicableCount: number;
	readyCount: number;
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

function toStartOfDay(date: Date): Date {
	const normalized = new Date(date);
	normalized.setHours(0, 0, 0, 0);
	return normalized;
}

function resolveAsOfDate(asOf: string | Date | undefined): Date {
	if (!asOf) return toStartOfDay(new Date());
	return toStartOfDay(typeof asOf === 'string' ? parseDate(asOf) : asOf);
}

function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

function normalizeReportMosFilter(mos: string | string[] | undefined): string[] {
	if (!mos) return [];
	const values = Array.isArray(mos) ? mos : mos.split(',');
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildLatestCompletionLookup(
	completions: PersonnelIctCompletion[],
	asOf?: string | Date
): Map<string, PersonnelIctCompletion> {
	const asOfDate = asOf ? formatDate(resolveAsOfDate(asOf)) : null;
	const lookup = new Map<string, PersonnelIctCompletion>();
	for (const completion of completions) {
		if (asOfDate && completion.completedAt > asOfDate) {
			continue;
		}

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

function compareBelowThresholdTaskRows(left: IctTaskBelowThresholdRow, right: IctTaskBelowThresholdRow): number {
	return (
		left.percentComplete - right.percentComplete ||
		right.soldierGapCount - left.soldierGapCount ||
		left.taskCode.localeCompare(right.taskCode) ||
		left.taskName.localeCompare(right.taskName) ||
		left.taskId.localeCompare(right.taskId)
	);
}

function buildReadinessSnapshot(input: {
	personnel: Personnel[];
	activeTasks: IctTask[];
	completions: PersonnelIctCompletion[];
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
}): ReadinessSnapshot {
	const latestCompletions = buildLatestCompletionLookup(input.completions, input.asOf);
	const taskSummaries = new Map<string, TaskReadinessSummary>();
	let applicableCount = 0;
	let readyCount = 0;
	let soldiersBelowThresholdCount = 0;

	for (const person of input.personnel) {
		if (person.archivedAt) {
			continue;
		}

		let soldierApplicableCount = 0;
		let soldierReadyCount = 0;
		for (const task of input.activeTasks) {
			if (!isIctTaskApplicableToMos(task, person.mos)) {
				continue;
			}

			applicableCount += 1;
			soldierApplicableCount += 1;
			const taskSummary = taskSummaries.get(task.id) ?? { task, applicableCount: 0, readyCount: 0 };
			taskSummary.applicableCount += 1;

			const completion = latestCompletions.get(completionKey(person.id, task.id));
			const status = getIctStatus(completion?.completedAt ?? null, task, input.settings, input.asOf).status;
			if (status === 'current' || status === 'expiring-soon') {
				readyCount += 1;
				soldierReadyCount += 1;
				taskSummary.readyCount += 1;
			}

			taskSummaries.set(task.id, taskSummary);
		}

		if (
			soldierApplicableCount > 0 &&
			computeReadinessPercent(soldierReadyCount, soldierApplicableCount) < READINESS_THRESHOLD_PERCENT
		) {
			soldiersBelowThresholdCount += 1;
		}
	}

	const tasksBelowThresholdRows: IctTaskBelowThresholdRow[] = [];
	for (const counts of taskSummaries.values()) {
		const percentComplete = computeReadinessPercent(counts.readyCount, counts.applicableCount);
		if (counts.applicableCount > 0 && percentComplete < READINESS_THRESHOLD_PERCENT) {
			tasksBelowThresholdRows.push({
				taskId: counts.task.id,
				taskCode: counts.task.taskCode,
				taskName: counts.task.title,
				percentComplete,
				soldierGapCount: counts.applicableCount - counts.readyCount,
				applicableCount: counts.applicableCount,
				completeCount: counts.readyCount
			});
		}
	}
	tasksBelowThresholdRows.sort(compareBelowThresholdTaskRows);

	return {
		percent: computeReadinessPercent(readyCount, applicableCount),
		readyCount,
		applicableCount,
		soldiersBelowThresholdCount,
		tasksBelowThresholdRows,
		latestCompletions
	};
}

function countExpiringSoon(input: {
	personnel: Personnel[];
	activeTasks: IctTask[];
	latestCompletions: Map<string, PersonnelIctCompletion>;
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
}): { count: number; affectedSoldiers: number } {
	const asOfDate = resolveAsOfDate(input.asOf);
	const asOfText = formatDate(asOfDate);
	const windowEndText = formatDate(addDays(asOfDate, EXPIRING_SOON_WINDOW_DAYS));
	const affectedSoldierIds = new Set<string>();
	let count = 0;

	for (const person of input.personnel) {
		if (person.archivedAt) {
			continue;
		}

		for (const task of input.activeTasks) {
			if (!isIctTaskApplicableToMos(task, person.mos)) {
				continue;
			}

			const completion = input.latestCompletions.get(completionKey(person.id, task.id));
			const expirationDate = calculateIctExpirationDate(completion?.completedAt ?? null, task, input.settings);
			if (expirationDate && expirationDate >= asOfText && expirationDate <= windowEndText) {
				count += 1;
				affectedSoldierIds.add(person.id);
			}
		}
	}

	return {
		count,
		affectedSoldiers: affectedSoldierIds.size
	};
}

function buildCompletionTrend(
	personnel: Personnel[],
	tasks: IctTask[],
	completions: PersonnelIctCompletion[]
): IctCompletionTrendPoint[] {
	// The report trend intentionally counts logged completion events, not just the latest
	// status per person-task pair. Personnel with repeated recertifications should appear
	// multiple times in the month they were logged.
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
	const mosFilters = normalizeReportMosFilter(filters.mos);
	return personnel.filter((person) => {
		if (person.archivedAt) return false;
		if (filters.groupId && person.groupId !== filters.groupId) return false;
		if (mosFilters.length > 0 && !mosFilters.includes(person.mos)) return false;
		if (filters.role && person.clinicRole !== filters.role) return false;
		if (filters.rank && person.rank !== filters.rank) return false;
		return true;
	});
}

export function buildIctReportDashboard({
	personnel,
	tasks,
	completions,
	settings = null,
	asOf
}: BuildIctReportSummaryInput): IctReportDashboard {
	const activeTasks = getActiveIctTasksForLibrary(tasks);
	const currentAsOfDate = resolveAsOfDate(asOf);
	const previousAsOf = addDays(currentAsOfDate, -30);
	const currentSnapshot = buildReadinessSnapshot({
		personnel,
		activeTasks,
		completions,
		settings,
		asOf: currentAsOfDate
	});
	const previousSnapshot = buildReadinessSnapshot({
		personnel,
		activeTasks,
		completions,
		settings,
		asOf: previousAsOf
	});
	const expiringSoon = countExpiringSoon({
		personnel,
		activeTasks,
		latestCompletions: currentSnapshot.latestCompletions,
		settings,
		asOf: currentAsOfDate
	});

	return {
		kpis: {
			overallReadiness: {
				percent: currentSnapshot.percent,
				deltaPercent: currentSnapshot.percent - previousSnapshot.percent,
				readyCount: currentSnapshot.readyCount,
				applicableCount: currentSnapshot.applicableCount
			},
			soldiersBelow70: {
				count: currentSnapshot.soldiersBelowThresholdCount,
				totalAssigned: personnel.filter((person) => !person.archivedAt).length,
				thresholdPercent: READINESS_THRESHOLD_PERCENT
			},
			tasksExpiringSoon: {
				...expiringSoon,
				windowDays: EXPIRING_SOON_WINDOW_DAYS
			},
			tasksBelowThreshold: {
				count: currentSnapshot.tasksBelowThresholdRows.length,
				thresholdPercent: READINESS_THRESHOLD_PERCENT
			}
		},
		tasksBelowThreshold: {
			thresholdPercent: READINESS_THRESHOLD_PERCENT,
			rows: currentSnapshot.tasksBelowThresholdRows
		}
	};
}

export function buildIctReportSummary({
	personnel,
	tasks,
	completions,
	completionTrend,
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
		completionTrend: completionTrend ?? buildCompletionTrend(personnel, activeTasks, completions)
	};
}

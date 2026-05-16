import type {
	CriticalTasksSettingsInput,
	IctStatus,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';
import type { Personnel } from '$lib/types';
import { calculateIctExpirationDate, getIctStatus, normalizeCriticalTasksSettings } from './ictStatus';
import { isIctTaskApplicableToMos } from './ictTaskLibrary';
import { formatDate, parseDate } from '$lib/utils/dates';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const CRITICAL_TASK_READINESS_THRESHOLD_PERCENT = 70;

export interface IctTaskBelowThresholdRow {
	taskId: string;
	taskCode: string;
	taskName: string;
	percentComplete: number;
	soldierGapCount: number;
	applicableCount: number;
	completeCount: number;
}

export interface IctAtRiskSoldierRow {
	personnelId: string;
	soldierName: string;
	mos: string;
	rank: string;
	groupName: string;
	readinessPercent: number;
	applicableCount: number;
	readyCount: number;
	tasksExpiringSoonCount: number;
	daysSinceLastIctUpdate: number | null;
	lastIctUpdateAt: string | null;
}

export interface CriticalTasksReadinessSnapshot {
	percent: number;
	readyCount: number;
	applicableCount: number;
	soldiersBelowThresholdCount: number;
	tasksBelowThresholdRows: IctTaskBelowThresholdRow[];
	atRiskSoldierRows: IctAtRiskSoldierRow[];
	latestCompletions: Map<string, PersonnelIctCompletion>;
}

export interface CriticalTasksMosReadinessCounts {
	mos: string;
	personnelCount: number;
	readinessPercent: number;
	readyCount: number;
	applicableCount: number;
}

export interface CriticalTasksSoldierReadinessSummary {
	readinessPercent: number;
	applicableCount: number;
	readyCount: number;
	attentionCount: number;
	currentCount: number;
	expiringSoonCount: number;
	expiredCount: number;
	notRecordedCount: number;
}

interface TaskReadinessSummary {
	task: IctTask;
	applicableCount: number;
	readyCount: number;
}

interface ReadinessCounts {
	percent: number;
	readyCount: number;
	applicableCount: number;
}

export function ictCompletionKey(personnelId: string, ictTaskId: string): string {
	return `${personnelId}:${ictTaskId}`;
}

export function compareIctCompletionRecency(a: PersonnelIctCompletion, b: PersonnelIctCompletion): number {
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

export function resolveCriticalTasksAsOfDate(asOf: string | Date | undefined): Date {
	if (!asOf) return toStartOfDay(new Date());
	return toStartOfDay(typeof asOf === 'string' ? parseDate(asOf) : asOf);
}

export function addCriticalTasksDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

function daysBetweenDates(start: Date, end: Date): number {
	const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) / MS_PER_DAY;
	const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) / MS_PER_DAY;
	return Math.max(0, endDay - startDay);
}

function dateOnlyFromTimestamp(timestamp: string): Date {
	return parseDate(timestamp.slice(0, 10));
}

function soldierName(person: Personnel): string {
	return `${person.lastName}, ${person.firstName}`;
}

export function normalizeCriticalTasksMosName(mos: string): string {
	return mos.trim() || 'Unknown';
}

export function buildLatestIctCompletionLookup(
	completions: PersonnelIctCompletion[],
	asOf?: string | Date
): Map<string, PersonnelIctCompletion> {
	const asOfDate = asOf ? formatDate(resolveCriticalTasksAsOfDate(asOf)) : null;
	const lookup = new Map<string, PersonnelIctCompletion>();
	for (const completion of completions) {
		if (asOfDate && completion.completedAt > asOfDate) {
			continue;
		}

		const key = ictCompletionKey(completion.personnelId, completion.ictTaskId);
		const existing = lookup.get(key);
		if (!existing || compareIctCompletionRecency(existing, completion) < 0) {
			lookup.set(key, completion);
		}
	}

	return lookup;
}

export function computeCriticalTasksReadinessPercent(readyCount: number, applicableCount: number): number {
	if (applicableCount === 0) {
		return 0;
	}

	return Math.round((readyCount / applicableCount) * 100);
}

export function isCriticalTaskStatusReady(status: IctStatus): boolean {
	return status === 'current' || status === 'expiring-soon';
}

export function isCriticalTaskCompletionReady(
	completionDate: string | null,
	task: Pick<IctTask, 'expirationMonths'>,
	settings?: CriticalTasksSettingsInput | null,
	asOf?: string | Date
): boolean {
	const status = getIctStatus(completionDate, task, settings, asOf).status;
	return isCriticalTaskStatusReady(status);
}

export function buildCriticalTasksSoldierReadinessSummary(input: {
	person: Pick<Personnel, 'id' | 'mos'>;
	activeTasks: IctTask[];
	completions?: PersonnelIctCompletion[];
	latestCompletions?: Map<string, PersonnelIctCompletion>;
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
}): CriticalTasksSoldierReadinessSummary {
	const latestCompletions =
		input.latestCompletions ?? buildLatestIctCompletionLookup(input.completions ?? [], input.asOf);
	let applicableCount = 0;
	let readyCount = 0;
	let currentCount = 0;
	let expiringSoonCount = 0;
	let expiredCount = 0;
	let notRecordedCount = 0;

	for (const task of input.activeTasks) {
		if (!isIctTaskApplicableToMos(task, input.person.mos)) {
			continue;
		}

		applicableCount += 1;
		const completion = latestCompletions.get(ictCompletionKey(input.person.id, task.id));
		const status = getIctStatus(completion?.completedAt ?? null, task, input.settings, input.asOf).status;
		if (status === 'current') {
			currentCount += 1;
		} else if (status === 'expiring-soon') {
			expiringSoonCount += 1;
		} else if (status === 'expired') {
			expiredCount += 1;
		} else {
			notRecordedCount += 1;
		}

		if (isCriticalTaskStatusReady(status)) {
			readyCount += 1;
		}
	}

	const attentionCount = applicableCount - readyCount;
	return {
		readinessPercent: computeCriticalTasksReadinessPercent(readyCount, applicableCount),
		applicableCount,
		readyCount,
		attentionCount,
		currentCount,
		expiringSoonCount,
		expiredCount,
		notRecordedCount
	};
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

function compareOptionalDaysDescending(left: number | null, right: number | null): number {
	if (left === null && right === null) return 0;
	if (left === null) return 1;
	if (right === null) return -1;
	return right - left;
}

function compareAtRiskSoldierRows(left: IctAtRiskSoldierRow, right: IctAtRiskSoldierRow): number {
	return (
		left.readinessPercent - right.readinessPercent ||
		right.tasksExpiringSoonCount - left.tasksExpiringSoonCount ||
		compareOptionalDaysDescending(left.daysSinceLastIctUpdate, right.daysSinceLastIctUpdate) ||
		left.soldierName.localeCompare(right.soldierName) ||
		left.rank.localeCompare(right.rank) ||
		left.personnelId.localeCompare(right.personnelId)
	);
}

function buildLastIctUpdateLookup(input: {
	personnel: Personnel[];
	activeTasks: IctTask[];
	completions: PersonnelIctCompletion[];
	asOf?: string | Date;
}): Map<string, PersonnelIctCompletion> {
	const asOfDate = input.asOf ? formatDate(resolveCriticalTasksAsOfDate(input.asOf)) : null;
	const personnelById = new Map(input.personnel.map((person) => [person.id, person]));
	const activeTasksById = new Map(input.activeTasks.map((task) => [task.id, task]));
	const latestByPersonnel = new Map<string, PersonnelIctCompletion>();

	for (const completion of input.completions) {
		if (asOfDate && completion.completedAt > asOfDate) {
			continue;
		}

		const person = personnelById.get(completion.personnelId);
		const task = activeTasksById.get(completion.ictTaskId);
		if (!person || person.archivedAt || !task || !isIctTaskApplicableToMos(task, person.mos)) {
			continue;
		}

		const existing = latestByPersonnel.get(person.id);
		if (!existing || completion.createdAt.localeCompare(existing.createdAt) > 0) {
			latestByPersonnel.set(person.id, completion);
		}
	}

	return latestByPersonnel;
}

export function buildCriticalTasksReadinessSnapshot(input: {
	personnel: Personnel[];
	activeTasks: IctTask[];
	completions: PersonnelIctCompletion[];
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
}): CriticalTasksReadinessSnapshot {
	const latestCompletions = buildLatestIctCompletionLookup(input.completions, input.asOf);
	const lastIctUpdates = buildLastIctUpdateLookup(input);
	const asOfDate = resolveCriticalTasksAsOfDate(input.asOf);
	const asOfText = formatDate(asOfDate);
	const expiringSoonWindowDays = normalizeCriticalTasksSettings(input.settings).expiringSoonWarningDays;
	const expiringSoonWindowEndText = formatDate(addCriticalTasksDays(asOfDate, expiringSoonWindowDays));
	const taskSummaries = new Map<string, TaskReadinessSummary>();
	const atRiskSoldierRows: IctAtRiskSoldierRow[] = [];
	let applicableCount = 0;
	let readyCount = 0;
	let soldiersBelowThresholdCount = 0;

	for (const person of input.personnel) {
		if (person.archivedAt) {
			continue;
		}

		let soldierApplicableCount = 0;
		let soldierReadyCount = 0;
		let soldierExpiringSoonCount = 0;
		for (const task of input.activeTasks) {
			if (!isIctTaskApplicableToMos(task, person.mos)) {
				continue;
			}

			applicableCount += 1;
			soldierApplicableCount += 1;
			const taskSummary = taskSummaries.get(task.id) ?? { task, applicableCount: 0, readyCount: 0 };
			taskSummary.applicableCount += 1;

			const completion = latestCompletions.get(ictCompletionKey(person.id, task.id));
			const expirationDate = calculateIctExpirationDate(completion?.completedAt ?? null, task, input.settings);
			if (isCriticalTaskCompletionReady(completion?.completedAt ?? null, task, input.settings, input.asOf)) {
				readyCount += 1;
				soldierReadyCount += 1;
				taskSummary.readyCount += 1;
			}
			if (expirationDate && expirationDate >= asOfText && expirationDate <= expiringSoonWindowEndText) {
				soldierExpiringSoonCount += 1;
			}

			taskSummaries.set(task.id, taskSummary);
		}

		if (soldierApplicableCount === 0) {
			continue;
		}

		const lastUpdate = lastIctUpdates.get(person.id) ?? null;
		const readinessPercent = computeCriticalTasksReadinessPercent(soldierReadyCount, soldierApplicableCount);
		atRiskSoldierRows.push({
			personnelId: person.id,
			soldierName: soldierName(person),
			mos: person.mos,
			rank: person.rank,
			groupName: person.groupName,
			readinessPercent,
			applicableCount: soldierApplicableCount,
			readyCount: soldierReadyCount,
			tasksExpiringSoonCount: soldierExpiringSoonCount,
			daysSinceLastIctUpdate: lastUpdate
				? daysBetweenDates(dateOnlyFromTimestamp(lastUpdate.createdAt), asOfDate)
				: null,
			lastIctUpdateAt: lastUpdate?.createdAt ?? null
		});

		if (readinessPercent < CRITICAL_TASK_READINESS_THRESHOLD_PERCENT) {
			soldiersBelowThresholdCount += 1;
		}
	}
	atRiskSoldierRows.sort(compareAtRiskSoldierRows);

	const tasksBelowThresholdRows: IctTaskBelowThresholdRow[] = [];
	for (const counts of taskSummaries.values()) {
		const percentComplete = computeCriticalTasksReadinessPercent(counts.readyCount, counts.applicableCount);
		if (counts.applicableCount > 0 && percentComplete < CRITICAL_TASK_READINESS_THRESHOLD_PERCENT) {
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
		percent: computeCriticalTasksReadinessPercent(readyCount, applicableCount),
		readyCount,
		applicableCount,
		soldiersBelowThresholdCount,
		tasksBelowThresholdRows,
		atRiskSoldierRows,
		latestCompletions
	};
}

export function countCriticalTasksExpiringSoon(input: {
	personnel: Personnel[];
	activeTasks: IctTask[];
	latestCompletions: Map<string, PersonnelIctCompletion>;
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
}): { count: number; affectedSoldiers: number } {
	const asOfDate = resolveCriticalTasksAsOfDate(input.asOf);
	const asOfText = formatDate(asOfDate);
	const windowDays = normalizeCriticalTasksSettings(input.settings).expiringSoonWarningDays;
	const windowEndText = formatDate(addCriticalTasksDays(asOfDate, windowDays));
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

			const completion = input.latestCompletions.get(ictCompletionKey(person.id, task.id));
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

export function buildCriticalTasksReadinessCounts(input: {
	personnel: Personnel[];
	activeTasks: IctTask[];
	completions?: PersonnelIctCompletion[];
	latestCompletions?: Map<string, PersonnelIctCompletion>;
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
	comparisonMos?: { mos: string; personnelCount: number }[];
}): { overall: ReadinessCounts; mosReadiness: CriticalTasksMosReadinessCounts[] } {
	const latestCompletions =
		input.latestCompletions ?? buildLatestIctCompletionLookup(input.completions ?? [], input.asOf);
	const comparisonMos = input.comparisonMos ?? [];
	const comparisonMosSet = new Set(comparisonMos.map(({ mos }) => mos));
	const mosCounts = new Map<string, { readyCount: number; applicableCount: number }>(
		comparisonMos.map(({ mos }) => [mos, { readyCount: 0, applicableCount: 0 }])
	);
	let readyCount = 0;
	let applicableCount = 0;

	for (const person of input.personnel) {
		if (person.archivedAt) {
			continue;
		}

		const mos = normalizeCriticalTasksMosName(person.mos);
		const selectedMosCounts = comparisonMosSet.has(mos) ? mosCounts.get(mos) : undefined;
		for (const task of input.activeTasks) {
			if (!isIctTaskApplicableToMos(task, person.mos)) {
				continue;
			}

			applicableCount += 1;
			if (selectedMosCounts) {
				selectedMosCounts.applicableCount += 1;
			}

			const completion = latestCompletions.get(ictCompletionKey(person.id, task.id));
			if (isCriticalTaskCompletionReady(completion?.completedAt ?? null, task, input.settings, input.asOf)) {
				readyCount += 1;
				if (selectedMosCounts) {
					selectedMosCounts.readyCount += 1;
				}
			}
		}
	}

	return {
		overall: {
			percent: computeCriticalTasksReadinessPercent(readyCount, applicableCount),
			readyCount,
			applicableCount
		},
		mosReadiness: comparisonMos.map(({ mos, personnelCount }) => {
			const counts = mosCounts.get(mos) ?? { readyCount: 0, applicableCount: 0 };
			return {
				mos,
				personnelCount,
				readinessPercent: computeCriticalTasksReadinessPercent(counts.readyCount, counts.applicableCount),
				readyCount: counts.readyCount,
				applicableCount: counts.applicableCount
			};
		})
	};
}

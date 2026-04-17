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
const MS_PER_DAY = 1000 * 60 * 60 * 24;

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

export interface IctReadinessTrendMonth {
	month: string;
	label: string;
	overallReadinessPercent: number;
	overallReadyCount: number;
	overallApplicableCount: number;
	mosReadiness: IctReadinessTrendMosSnapshot[];
}

export interface IctReadinessTrendMosSnapshot {
	mos: string;
	personnelCount: number;
	readinessPercent: number;
	readyCount: number;
	applicableCount: number;
}

export interface IctReadinessTrend {
	comparisonMos: string[];
	months: IctReadinessTrendMonth[];
}

export interface IctExpirationCliffMosSegment {
	mos: string;
	expiringCount: number;
}

export interface IctExpirationCliffMonth {
	month: string;
	label: string;
	totalExpiringCount: number;
	mosSegments: IctExpirationCliffMosSegment[];
}

export interface IctExpirationCliff {
	mosSeries: string[];
	months: IctExpirationCliffMonth[];
	projectedReadinessAtMonth6: {
		month: string;
		label: string;
		readinessPercent: number;
		readyCount: number;
		applicableCount: number;
	};
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
	atRiskSoldiers: {
		rows: IctAtRiskSoldierRow[];
	};
	readinessTrend: IctReadinessTrend;
	expirationCliff: IctExpirationCliff;
}

interface ReadinessSnapshot {
	percent: number;
	readyCount: number;
	applicableCount: number;
	soldiersBelowThresholdCount: number;
	tasksBelowThresholdRows: IctTaskBelowThresholdRow[];
	atRiskSoldierRows: IctAtRiskSoldierRow[];
	latestCompletions: Map<string, PersonnelIctCompletion>;
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

function addMonths(date: Date, months: number): Date {
	const next = new Date(date);
	next.setMonth(next.getMonth() + months, 1);
	return next;
}

function endOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function formatMonthKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(date: Date): string {
	return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
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

function normalizeMosName(mos: string): string {
	return mos.trim() || 'Unknown';
}

function normalizeReportMosFilter(mos: string | string[] | undefined): string[] {
	if (!mos) return [];
	const values = Array.isArray(mos) ? mos : mos.split(',');
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function selectTopMosByHeadcount(personnel: Personnel[], limit = 4): { mos: string; personnelCount: number }[] {
	const headcounts = new Map<string, number>();
	for (const person of personnel) {
		if (person.archivedAt) {
			continue;
		}

		const mos = normalizeMosName(person.mos);
		headcounts.set(mos, (headcounts.get(mos) ?? 0) + 1);
	}

	return [...headcounts.entries()]
		.map(([mos, personnelCount]) => ({ mos, personnelCount }))
		.sort((left, right) => right.personnelCount - left.personnelCount || left.mos.localeCompare(right.mos))
		.slice(0, limit);
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
	const asOfDate = input.asOf ? formatDate(resolveAsOfDate(input.asOf)) : null;
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

function buildReadinessSnapshot(input: {
	personnel: Personnel[];
	activeTasks: IctTask[];
	completions: PersonnelIctCompletion[];
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
}): ReadinessSnapshot {
	const latestCompletions = buildLatestCompletionLookup(input.completions, input.asOf);
	const lastIctUpdates = buildLastIctUpdateLookup(input);
	const asOfDate = resolveAsOfDate(input.asOf);
	const asOfText = formatDate(asOfDate);
	const expiringSoonWindowEndText = formatDate(addDays(asOfDate, EXPIRING_SOON_WINDOW_DAYS));
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

			const completion = latestCompletions.get(completionKey(person.id, task.id));
			const status = getIctStatus(completion?.completedAt ?? null, task, input.settings, input.asOf).status;
			const expirationDate = calculateIctExpirationDate(completion?.completedAt ?? null, task, input.settings);
			if (status === 'current' || status === 'expiring-soon') {
				readyCount += 1;
				soldierReadyCount += 1;
				taskSummary.readyCount += 1;
			}
			if (expirationDate && expirationDate >= asOfText && expirationDate <= expiringSoonWindowEndText) {
				soldierExpiringSoonCount += 1;
			}

			taskSummaries.set(task.id, taskSummary);
		}

		const lastUpdate = lastIctUpdates.get(person.id) ?? null;
		atRiskSoldierRows.push({
			personnelId: person.id,
			soldierName: soldierName(person),
			mos: person.mos,
			rank: person.rank,
			groupName: person.groupName,
			readinessPercent: computeReadinessPercent(soldierReadyCount, soldierApplicableCount),
			applicableCount: soldierApplicableCount,
			readyCount: soldierReadyCount,
			tasksExpiringSoonCount: soldierExpiringSoonCount,
			daysSinceLastIctUpdate: lastUpdate
				? daysBetweenDates(dateOnlyFromTimestamp(lastUpdate.createdAt), asOfDate)
				: null,
			lastIctUpdateAt: lastUpdate?.createdAt ?? null
		});

		if (
			soldierApplicableCount > 0 &&
			computeReadinessPercent(soldierReadyCount, soldierApplicableCount) < READINESS_THRESHOLD_PERCENT
		) {
			soldiersBelowThresholdCount += 1;
		}
	}
	atRiskSoldierRows.sort(compareAtRiskSoldierRows);

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
		atRiskSoldierRows,
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

function buildReadinessCounts(input: {
	personnel: Personnel[];
	activeTasks: IctTask[];
	completions: PersonnelIctCompletion[];
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
	comparisonMos?: { mos: string; personnelCount: number }[];
}): { overall: ReadinessCounts; mosReadiness: IctReadinessTrendMosSnapshot[] } {
	const latestCompletions = buildLatestCompletionLookup(input.completions, input.asOf);
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

		const mos = normalizeMosName(person.mos);
		const selectedMosCounts = comparisonMosSet.has(mos) ? mosCounts.get(mos) : undefined;
		for (const task of input.activeTasks) {
			if (!isIctTaskApplicableToMos(task, person.mos)) {
				continue;
			}

			applicableCount += 1;
			if (selectedMosCounts) {
				selectedMosCounts.applicableCount += 1;
			}

			const completion = latestCompletions.get(completionKey(person.id, task.id));
			const status = getIctStatus(completion?.completedAt ?? null, task, input.settings, input.asOf).status;
			if (status === 'current' || status === 'expiring-soon') {
				readyCount += 1;
				if (selectedMosCounts) {
					selectedMosCounts.readyCount += 1;
				}
			}
		}
	}

	return {
		overall: {
			percent: computeReadinessPercent(readyCount, applicableCount),
			readyCount,
			applicableCount
		},
		mosReadiness: comparisonMos.map(({ mos, personnelCount }) => {
			const counts = mosCounts.get(mos) ?? { readyCount: 0, applicableCount: 0 };
			return {
				mos,
				personnelCount,
				readinessPercent: computeReadinessPercent(counts.readyCount, counts.applicableCount),
				readyCount: counts.readyCount,
				applicableCount: counts.applicableCount
			};
		})
	};
}

function buildReadinessTrend(input: {
	personnel: Personnel[];
	activeTasks: IctTask[];
	completions: PersonnelIctCompletion[];
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
}): IctReadinessTrend {
	const asOfDate = resolveAsOfDate(input.asOf);
	const currentMonthStart = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1);
	const comparisonMos = selectTopMosByHeadcount(input.personnel);
	const months = Array.from({ length: 12 }, (_, index) => addMonths(currentMonthStart, index - 11)).map(
		(monthStart) => {
			const snapshotDate =
				monthStart.getFullYear() === currentMonthStart.getFullYear() &&
				monthStart.getMonth() === currentMonthStart.getMonth()
					? asOfDate
					: endOfMonth(monthStart);
			const snapshot = buildReadinessCounts({
				personnel: input.personnel,
				activeTasks: input.activeTasks,
				completions: input.completions,
				settings: input.settings,
				asOf: snapshotDate,
				comparisonMos
			});

			return {
				month: formatMonthKey(monthStart),
				label: formatMonthLabel(monthStart),
				overallReadinessPercent: snapshot.overall.percent,
				overallReadyCount: snapshot.overall.readyCount,
				overallApplicableCount: snapshot.overall.applicableCount,
				mosReadiness: snapshot.mosReadiness
			};
		}
	);

	return {
		comparisonMos: comparisonMos.map(({ mos }) => mos),
		months
	};
}

function buildExpirationCliff(input: {
	personnel: Personnel[];
	activeTasks: IctTask[];
	completions: PersonnelIctCompletion[];
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
}): IctExpirationCliff {
	const asOfDate = resolveAsOfDate(input.asOf);
	const asOfText = formatDate(asOfDate);
	const currentMonthStart = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1);
	const monthStarts = Array.from({ length: 6 }, (_, index) => addMonths(currentMonthStart, index));
	const projectionMonthStart = monthStarts.at(-1) ?? currentMonthStart;
	const projectionAsOf = endOfMonth(projectionMonthStart);
	const projectionEndText = formatDate(projectionAsOf);
	const latestCompletions = buildLatestCompletionLookup(input.completions, asOfDate);
	const monthMosCounts = new Map<string, Map<string, number>>(
		monthStarts.map((monthStart) => [formatMonthKey(monthStart), new Map<string, number>()])
	);
	const mosTotals = new Map<string, number>();

	for (const person of input.personnel) {
		if (person.archivedAt) {
			continue;
		}

		const mos = normalizeMosName(person.mos);
		for (const task of input.activeTasks) {
			if (!isIctTaskApplicableToMos(task, person.mos)) {
				continue;
			}

			const completion = latestCompletions.get(completionKey(person.id, task.id));
			const expirationDate = calculateIctExpirationDate(completion?.completedAt ?? null, task, input.settings);
			if (!expirationDate || expirationDate < asOfText || expirationDate > projectionEndText) {
				continue;
			}

			const monthKey = expirationDate.slice(0, 7);
			const mosCounts = monthMosCounts.get(monthKey);
			if (!mosCounts) {
				continue;
			}

			mosCounts.set(mos, (mosCounts.get(mos) ?? 0) + 1);
			mosTotals.set(mos, (mosTotals.get(mos) ?? 0) + 1);
		}
	}

	const mosSeries = [...mosTotals.entries()]
		.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
		.map(([mos]) => mos);
	const months = monthStarts.map((monthStart) => {
		const month = formatMonthKey(monthStart);
		const mosCounts = monthMosCounts.get(month) ?? new Map<string, number>();
		const mosSegments = mosSeries.map((mos) => ({
			mos,
			expiringCount: mosCounts.get(mos) ?? 0
		}));

		return {
			month,
			label: formatMonthLabel(monthStart),
			totalExpiringCount: mosSegments.reduce((total, segment) => total + segment.expiringCount, 0),
			mosSegments
		};
	});
	const currentCompletions = input.completions.filter((completion) => completion.completedAt <= asOfText);
	const projectedReadiness = buildReadinessCounts({
		personnel: input.personnel,
		activeTasks: input.activeTasks,
		completions: currentCompletions,
		settings: input.settings,
		asOf: projectionAsOf
	});

	return {
		mosSeries,
		months,
		projectedReadinessAtMonth6: {
			month: formatMonthKey(projectionMonthStart),
			label: formatMonthLabel(projectionMonthStart),
			readinessPercent: projectedReadiness.overall.percent,
			readyCount: projectedReadiness.overall.readyCount,
			applicableCount: projectedReadiness.overall.applicableCount
		}
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
		},
		atRiskSoldiers: {
			rows: currentSnapshot.atRiskSoldierRows
		},
		readinessTrend: buildReadinessTrend({
			personnel,
			activeTasks,
			completions,
			settings,
			asOf: currentAsOfDate
		}),
		expirationCliff: buildExpirationCliff({
			personnel,
			activeTasks,
			completions,
			settings,
			asOf: currentAsOfDate
		})
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

import type {
	CriticalTasksSettingsInput,
	IctStatus,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';
import type { Personnel } from '$lib/types';
import { calculateIctExpirationDate, normalizeCriticalTasksSettings } from './ictStatus';
import { getActiveIctTasksForLibrary, isIctTaskApplicableToMos } from './ictTaskLibrary';
import { formatDate, parseDate } from '$lib/utils/dates';
import {
	tallyReadinessBy,
	tallyReadinessGrid,
	type ReadinessFact,
	type ReadinessTallyConfig
} from '$lib/domain/readinessRollup';
import {
	CRITICAL_TASK_READINESS_THRESHOLD_PERCENT,
	ICT_READINESS_ROLLUP,
	ICT_READY_STATES,
	addCriticalTasksDays,
	buildCriticalTasksReadinessCounts,
	buildCriticalTasksReadinessSnapshot,
	buildIctReadinessFacts,
	buildLatestIctCompletionLookup,
	compareIctCompletionRecency,
	countCriticalTasksExpiringSoon,
	ictCompletionKey,
	normalizeCriticalTasksMosName,
	resolveCriticalTasksAsOfDate,
	type IctAtRiskSoldierRow,
	type IctTaskBelowThresholdRow
} from './ictReadinessSnapshot';

/**
 * The readiness matrix's declared divergence from the shared counting
 * convention: an empty denominator renders as a null "not applicable" cell
 * rather than 0% (see Readiness Rollup in CONTEXT.md).
 */
const ICT_MATRIX_ROLLUP: ReadinessTallyConfig<IctStatus, null> = {
	readyStates: ICT_READY_STATES,
	zeroApplicablePercent: null
};

const UNCATEGORIZED_TASK_CATEGORY_KEY = '__uncategorized__';
const UNCATEGORIZED_TASK_CATEGORY_LABEL = 'Uncategorized';
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const READINESS_DISTRIBUTION_BINS: IctReadinessDistributionBinDefinition[] = [
	{ key: '0-20', label: '0-20%', minPercent: 0, maxPercent: 20 },
	{ key: '20-40', label: '20-40%', minPercent: 20, maxPercent: 40 },
	{ key: '40-60', label: '40-60%', minPercent: 40, maxPercent: 60 },
	{ key: '60-80', label: '60-80%', minPercent: 60, maxPercent: 80 },
	{ key: '80-100', label: '80-100%', minPercent: 80, maxPercent: 100 }
];

export interface IctReportFilters {
	groupId?: string;
	mos?: string | string[];
	role?: string;
	rank?: string;
}

export interface IctReportFilterPersonnel {
	id: string;
	groupId: string | null;
	mos: string;
	rank: string;
	dutyRole: string;
}

export interface IctReportScope {
	personnel: IctReportFilterPersonnel[];
	groups: Array<{ id: string; name: string }>;
	hasActiveTasks: boolean;
	activeTaskCount: number;
	totalPersonnelCount: number;
	filterOptions: {
		mos: string[];
		ranks: string[];
		roles: string[];
	};
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

export type { IctAtRiskSoldierRow, IctTaskBelowThresholdRow } from './ictReadinessSnapshot';

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

export type IctReadinessMatrixTier = 'danger' | 'warn' | 'caution' | 'okay' | 'good' | 'not-applicable';

export interface IctReadinessMatrixCategory {
	key: string;
	label: string;
	isUncategorized: boolean;
}

export interface IctReadinessMatrixCell {
	categoryKey: string;
	categoryLabel: string;
	readinessPercent: number | null;
	readyCount: number;
	applicableCount: number;
	tier: IctReadinessMatrixTier;
}

export interface IctReadinessMatrixRow {
	mos: string;
	personnelCount: number;
	averageReadinessPercent: number | null;
	averageReadyCount: number;
	averageApplicableCount: number;
	averageTier: IctReadinessMatrixTier;
	cells: IctReadinessMatrixCell[];
}

export interface IctReadinessMatrix {
	categories: IctReadinessMatrixCategory[];
	rows: IctReadinessMatrixRow[];
	hasCategorizedTasks: boolean;
}

export interface IctReadinessDistributionBinDefinition {
	key: string;
	label: string;
	minPercent: number;
	maxPercent: number;
}

export interface IctReadinessDistributionBin extends IctReadinessDistributionBinDefinition {
	soldierCount: number;
}

export interface IctReadinessDistributionSeries {
	mos: string;
	personnelCount: number;
	bins: IctReadinessDistributionBin[];
}

export interface IctReadinessDistribution {
	bins: IctReadinessDistributionBinDefinition[];
	defaultMos: string | null;
	series: IctReadinessDistributionSeries[];
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
			totalApplicable: number;
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
	readinessMatrix: IctReadinessMatrix;
	readinessDistribution: IctReadinessDistribution;
}

export interface IctReportDashboardSummary {
	hasActiveTasks: boolean;
	kpis: IctReportDashboard['kpis'];
	mosReadiness: IctReadinessTrendMosSnapshot[];
	readinessTrend: {
		months: Array<Pick<IctReadinessTrendMonth, 'month' | 'label' | 'overallReadinessPercent'>>;
	};
	projectedReadinessAtMonth6: IctExpirationCliff['projectedReadinessAtMonth6'];
	tasksBelowThreshold: {
		thresholdPercent: number;
		count: number;
		rows: IctTaskBelowThresholdRow[];
	};
	atRiskSoldiers: {
		totalApplicable: number;
		rows: IctAtRiskSoldierRow[];
	};
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

		const mos = normalizeCriticalTasksMosName(person.mos);
		headcounts.set(mos, (headcounts.get(mos) ?? 0) + 1);
	}

	return [...headcounts.entries()]
		.map(([mos, personnelCount]) => ({ mos, personnelCount }))
		.sort((left, right) => right.personnelCount - left.personnelCount || left.mos.localeCompare(right.mos))
		.slice(0, limit);
}

function readinessTierForPercent(percent: number | null): IctReadinessMatrixTier {
	if (percent === null) return 'not-applicable';
	if (percent < 60) return 'danger';
	if (percent < 70) return 'warn';
	if (percent < 80) return 'caution';
	if (percent < 90) return 'okay';
	return 'good';
}

function normalizeTaskCategoryLabel(category: string | null | undefined): string | null {
	const trimmed = category?.trim();
	return trimmed ? trimmed : null;
}

function taskCategoryKey(label: string): string {
	return `category:${label.toLocaleLowerCase('en-US')}`;
}

function taskCategoryForMatrix(task: IctTask): IctReadinessMatrixCategory {
	const label = normalizeTaskCategoryLabel(task.category);
	if (!label) {
		return {
			key: UNCATEGORIZED_TASK_CATEGORY_KEY,
			label: UNCATEGORIZED_TASK_CATEGORY_LABEL,
			isUncategorized: true
		};
	}

	return {
		key: taskCategoryKey(label),
		label,
		isUncategorized: false
	};
}

function buildReadinessMatrix(input: {
	personnel: Personnel[];
	activeTasks: IctTask[];
	latestCompletions: Map<string, PersonnelIctCompletion>;
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
}): IctReadinessMatrix {
	const categoriesByKey = new Map<string, IctReadinessMatrixCategory>();
	const categoryKeyByTaskId = new Map<string, string>();
	let hasCategorizedTasks = false;

	for (const task of input.activeTasks) {
		const category = taskCategoryForMatrix(task);
		if (!category.isUncategorized) {
			hasCategorizedTasks = true;
		}
		if (!categoriesByKey.has(category.key)) {
			categoriesByKey.set(category.key, category);
		}

		categoryKeyByTaskId.set(task.id, category.key);
	}

	const categories = [...categoriesByKey.values()];
	const mosByPersonnelId = new Map<string, string>();
	const headcounts = new Map<string, number>();
	for (const person of input.personnel) {
		if (person.archivedAt) {
			continue;
		}

		const mos = normalizeCriticalTasksMosName(person.mos);
		mosByPersonnelId.set(person.id, mos);
		headcounts.set(mos, (headcounts.get(mos) ?? 0) + 1);
	}

	// Seeded rows keep every MOS visible even when none of its Soldiers have
	// applicable tasks; seeded columns keep the grid rectangular per category.
	const facts = buildIctReadinessFacts(input);
	const rowKeyOf = (fact: ReadinessFact<IctStatus>) => mosByPersonnelId.get(fact.subjectKey)!;
	const colKeyOf = (fact: ReadinessFact<IctStatus>) => categoryKeyByTaskId.get(fact.requirementKey)!;
	const seedRowKeys = [...headcounts.keys()];
	const grid = tallyReadinessGrid(facts, ICT_MATRIX_ROLLUP, rowKeyOf, colKeyOf, {
		seedRowKeys,
		seedColKeys: categories.map((category) => category.key)
	});
	// A row total is the same fold one level coarser.
	const rowTotals = tallyReadinessBy(facts, ICT_MATRIX_ROLLUP, rowKeyOf, { seedKeys: seedRowKeys });

	const rows = [...grid.entries()]
		.map(([mos, cellsByCategory]) => {
			const total = rowTotals.get(mos)!;

			return {
				mos,
				personnelCount: headcounts.get(mos) ?? 0,
				averageReadinessPercent: total.percent,
				averageReadyCount: total.ready,
				averageApplicableCount: total.applicable,
				averageTier: readinessTierForPercent(total.percent),
				cells: categories.map((category) => {
					const cell = cellsByCategory.get(category.key)!;

					return {
						categoryKey: category.key,
						categoryLabel: category.label,
						readinessPercent: cell.percent,
						readyCount: cell.ready,
						applicableCount: cell.applicable,
						tier: readinessTierForPercent(cell.percent)
					};
				})
			};
		})
		.sort((left, right) => right.personnelCount - left.personnelCount || left.mos.localeCompare(right.mos));

	return {
		categories,
		rows,
		hasCategorizedTasks
	};
}

function buildReadinessDistribution(rows: IctAtRiskSoldierRow[]): IctReadinessDistribution {
	const rowsByMos = new Map<string, IctAtRiskSoldierRow[]>();
	for (const row of rows) {
		const mos = normalizeCriticalTasksMosName(row.mos);
		const mosRows = rowsByMos.get(mos) ?? [];
		mosRows.push(row);
		rowsByMos.set(mos, mosRows);
	}

	const series = [...rowsByMos.entries()]
		.map(([mos, mosRows]) => {
			const countsByBin = new Map(READINESS_DISTRIBUTION_BINS.map((bin) => [bin.key, 0]));
			for (const row of mosRows) {
				const bin = readinessDistributionBinForPercent(row.readinessPercent);
				countsByBin.set(bin.key, (countsByBin.get(bin.key) ?? 0) + 1);
			}

			return {
				mos,
				personnelCount: mosRows.length,
				bins: READINESS_DISTRIBUTION_BINS.map((bin) => ({
					...bin,
					soldierCount: countsByBin.get(bin.key) ?? 0
				}))
			};
		})
		.sort((left, right) => right.personnelCount - left.personnelCount || left.mos.localeCompare(right.mos));

	return {
		bins: READINESS_DISTRIBUTION_BINS.map((bin) => ({ ...bin })),
		defaultMos: series[0]?.mos ?? null,
		series
	};
}

function readinessDistributionBinForPercent(percent: number): IctReadinessDistributionBinDefinition {
	const clampedPercent = Math.min(Math.max(percent, 0), 100);
	const lastBin = READINESS_DISTRIBUTION_BINS[READINESS_DISTRIBUTION_BINS.length - 1];
	for (const bin of READINESS_DISTRIBUTION_BINS) {
		const isLastBin = bin.key === lastBin.key;
		if (clampedPercent >= bin.minPercent && (clampedPercent < bin.maxPercent || isLastBin)) {
			return bin;
		}
	}

	return lastBin;
}

function buildReadinessTrend(input: {
	personnel: Personnel[];
	activeTasks: IctTask[];
	completions: PersonnelIctCompletion[];
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
}): IctReadinessTrend {
	const asOfDate = resolveCriticalTasksAsOfDate(input.asOf);
	const currentMonthStart = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1);
	const comparisonMos = selectTopMosByHeadcount(input.personnel);
	const completionsByRecency = [...input.completions].sort(compareIctCompletionRecency);
	const latestCompletions = new Map<string, PersonnelIctCompletion>();
	let completionIndex = 0;
	const months = Array.from({ length: 12 }, (_, index) => addMonths(currentMonthStart, index - 11)).map(
		(monthStart) => {
			const snapshotDate =
				monthStart.getFullYear() === currentMonthStart.getFullYear() &&
				monthStart.getMonth() === currentMonthStart.getMonth()
					? asOfDate
					: endOfMonth(monthStart);
			const snapshotDateText = formatDate(snapshotDate);
			while (
				completionIndex < completionsByRecency.length &&
				completionsByRecency[completionIndex].completedAt <= snapshotDateText
			) {
				const completion = completionsByRecency[completionIndex];
				latestCompletions.set(ictCompletionKey(completion.personnelId, completion.ictTaskId), completion);
				completionIndex += 1;
			}
			const snapshot = buildCriticalTasksReadinessCounts({
				personnel: input.personnel,
				activeTasks: input.activeTasks,
				latestCompletions,
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

function buildDashboardReadinessTrend(input: {
	personnel: Personnel[];
	activeTasks: IctTask[];
	completions: PersonnelIctCompletion[];
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
}): IctReportDashboardSummary['readinessTrend'] {
	const asOfDate = resolveCriticalTasksAsOfDate(input.asOf);
	const currentMonthStart = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1);
	const completionsByRecency = [...input.completions].sort(compareIctCompletionRecency);
	const latestCompletions = new Map<string, PersonnelIctCompletion>();
	let completionIndex = 0;
	const months = Array.from({ length: 6 }, (_, index) => addMonths(currentMonthStart, index - 5)).map((monthStart) => {
		const snapshotDate =
			monthStart.getFullYear() === currentMonthStart.getFullYear() &&
			monthStart.getMonth() === currentMonthStart.getMonth()
				? asOfDate
				: endOfMonth(monthStart);
		const snapshotDateText = formatDate(snapshotDate);
		while (
			completionIndex < completionsByRecency.length &&
			completionsByRecency[completionIndex].completedAt <= snapshotDateText
		) {
			const completion = completionsByRecency[completionIndex];
			latestCompletions.set(ictCompletionKey(completion.personnelId, completion.ictTaskId), completion);
			completionIndex += 1;
		}
		const snapshot = buildCriticalTasksReadinessCounts({
			personnel: input.personnel,
			activeTasks: input.activeTasks,
			latestCompletions,
			settings: input.settings,
			asOf: snapshotDate
		});

		return {
			month: formatMonthKey(monthStart),
			label: formatMonthLabel(monthStart),
			overallReadinessPercent: snapshot.overall.percent
		};
	});

	return { months };
}

function buildDashboardProjectedReadiness(input: {
	personnel: Personnel[];
	activeTasks: IctTask[];
	completions: PersonnelIctCompletion[];
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
}): IctExpirationCliff['projectedReadinessAtMonth6'] {
	const asOfDate = resolveCriticalTasksAsOfDate(input.asOf);
	const asOfText = formatDate(asOfDate);
	const currentMonthStart = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1);
	const projectionMonthStart = addMonths(currentMonthStart, 5);
	const projectionAsOf = endOfMonth(projectionMonthStart);
	const currentCompletions = input.completions.filter((completion) => completion.completedAt <= asOfText);
	const projectedReadiness = buildCriticalTasksReadinessCounts({
		personnel: input.personnel,
		activeTasks: input.activeTasks,
		completions: currentCompletions,
		settings: input.settings,
		asOf: projectionAsOf
	});

	return {
		month: formatMonthKey(projectionMonthStart),
		label: formatMonthLabel(projectionMonthStart),
		readinessPercent: projectedReadiness.overall.percent,
		readyCount: projectedReadiness.overall.readyCount,
		applicableCount: projectedReadiness.overall.applicableCount
	};
}

function buildExpirationCliff(input: {
	personnel: Personnel[];
	activeTasks: IctTask[];
	completions: PersonnelIctCompletion[];
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
}): IctExpirationCliff {
	const asOfDate = resolveCriticalTasksAsOfDate(input.asOf);
	const asOfText = formatDate(asOfDate);
	const currentMonthStart = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1);
	const monthStarts = Array.from({ length: 6 }, (_, index) => addMonths(currentMonthStart, index));
	const projectionMonthStart = monthStarts.at(-1) ?? currentMonthStart;
	const projectionAsOf = endOfMonth(projectionMonthStart);
	const projectionEndText = formatDate(projectionAsOf);
	const latestCompletions = buildLatestIctCompletionLookup(input.completions, asOfDate);
	const monthMosCounts = new Map<string, Map<string, number>>(
		monthStarts.map((monthStart) => [formatMonthKey(monthStart), new Map<string, number>()])
	);
	const mosTotals = new Map<string, number>();

	for (const person of input.personnel) {
		if (person.archivedAt) {
			continue;
		}

		const mos = normalizeCriticalTasksMosName(person.mos);
		for (const task of input.activeTasks) {
			if (!isIctTaskApplicableToMos(task, person.mos)) {
				continue;
			}

			const completion = latestCompletions.get(ictCompletionKey(person.id, task.id));
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
	const projectedReadiness = buildCriticalTasksReadinessCounts({
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

function retainTopRows<T>(rows: T[], row: T, compare: (left: T, right: T) => number, limit: number): void {
	rows.push(row);
	rows.sort(compare);
	if (rows.length > limit) {
		rows.pop();
	}
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

function buildDashboardRiskRows(input: {
	personnel: Personnel[];
	activeTasks: IctTask[];
	completions: PersonnelIctCompletion[];
	latestCompletions: Map<string, PersonnelIctCompletion>;
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
	limit: number;
}): {
	soldiersBelowThresholdCount: number;
	totalApplicable: number;
	rows: IctAtRiskSoldierRow[];
} {
	const asOfDate = resolveCriticalTasksAsOfDate(input.asOf);
	const personnelById = new Map(input.personnel.map((person) => [person.id, person]));
	const lastIctUpdates = buildLastIctUpdateLookup(input);
	const facts = buildIctReadinessFacts(input);
	const bySoldier = tallyReadinessBy(facts, ICT_READINESS_ROLLUP, (fact) => fact.subjectKey);
	const rows: IctAtRiskSoldierRow[] = [];
	let soldiersBelowThresholdCount = 0;

	for (const [personnelId, tally] of bySoldier) {
		const person = personnelById.get(personnelId)!;
		const lastUpdate = lastIctUpdates.get(personnelId) ?? null;
		if (tally.percent < CRITICAL_TASK_READINESS_THRESHOLD_PERCENT) {
			soldiersBelowThresholdCount += 1;
		}

		retainTopRows(
			rows,
			{
				personnelId,
				soldierName: soldierName(person),
				mos: person.mos,
				rank: person.rank,
				groupName: person.groupName,
				readinessPercent: tally.percent,
				applicableCount: tally.applicable,
				readyCount: tally.ready,
				tasksExpiringSoonCount: tally.stateCounts.get('expiring-soon') ?? 0,
				daysSinceLastIctUpdate: lastUpdate
					? daysBetweenDates(dateOnlyFromTimestamp(lastUpdate.createdAt), asOfDate)
					: null,
				lastIctUpdateAt: lastUpdate?.createdAt ?? null
			},
			compareAtRiskSoldierRows,
			input.limit
		);
	}

	return {
		soldiersBelowThresholdCount,
		totalApplicable: bySoldier.size,
		rows
	};
}

function buildDashboardTasksBelowThreshold(input: {
	activeTasks: IctTask[];
	latestCompletions: Map<string, PersonnelIctCompletion>;
	personnel: Personnel[];
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
	limit: number;
}): IctReportDashboardSummary['tasksBelowThreshold'] {
	const tasksById = new Map(input.activeTasks.map((task) => [task.id, task]));
	const facts = buildIctReadinessFacts(input);
	const byTask = tallyReadinessBy(facts, ICT_READINESS_ROLLUP, (fact) => fact.requirementKey);
	const rows: IctTaskBelowThresholdRow[] = [];
	let count = 0;

	for (const [taskId, tally] of byTask) {
		if (tally.applicable === 0 || tally.percent >= CRITICAL_TASK_READINESS_THRESHOLD_PERCENT) {
			continue;
		}

		count += 1;
		const task = tasksById.get(taskId)!;
		retainTopRows(
			rows,
			{
				taskId,
				taskCode: task.taskCode,
				taskName: task.title,
				percentComplete: tally.percent,
				soldierGapCount: tally.applicable - tally.ready,
				applicableCount: tally.applicable,
				completeCount: tally.ready
			},
			compareBelowThresholdTaskRows,
			input.limit
		);
	}

	return {
		thresholdPercent: CRITICAL_TASK_READINESS_THRESHOLD_PERCENT,
		count,
		rows
	};
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
	const currentAsOfDate = resolveCriticalTasksAsOfDate(asOf);
	const previousAsOf = addCriticalTasksDays(currentAsOfDate, -30);
	const currentSnapshot = buildCriticalTasksReadinessSnapshot({
		personnel,
		activeTasks,
		completions,
		settings,
		asOf: currentAsOfDate
	});
	const previousSnapshot = buildCriticalTasksReadinessSnapshot({
		personnel,
		activeTasks,
		completions,
		settings,
		asOf: previousAsOf
	});
	const expiringSoon = countCriticalTasksExpiringSoon({
		personnel,
		activeTasks,
		latestCompletions: currentSnapshot.latestCompletions,
		settings,
		asOf: currentAsOfDate
	});
	const expiringSoonWindowDays = normalizeCriticalTasksSettings(settings).expiringSoonWarningDays;

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
				totalApplicable: currentSnapshot.atRiskSoldierRows.length,
				thresholdPercent: CRITICAL_TASK_READINESS_THRESHOLD_PERCENT
			},
			tasksExpiringSoon: {
				...expiringSoon,
				windowDays: expiringSoonWindowDays
			},
			tasksBelowThreshold: {
				count: currentSnapshot.tasksBelowThresholdRows.length,
				thresholdPercent: CRITICAL_TASK_READINESS_THRESHOLD_PERCENT
			}
		},
		tasksBelowThreshold: {
			thresholdPercent: CRITICAL_TASK_READINESS_THRESHOLD_PERCENT,
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
		}),
		readinessMatrix: buildReadinessMatrix({
			personnel,
			activeTasks,
			latestCompletions: currentSnapshot.latestCompletions,
			settings,
			asOf: currentAsOfDate
		}),
		readinessDistribution: buildReadinessDistribution(currentSnapshot.atRiskSoldierRows)
	};
}

export function buildIctReportDashboardSummary({
	personnel,
	tasks,
	completions,
	settings = null,
	asOf
}: BuildIctReportSummaryInput): IctReportDashboardSummary {
	const activeTasks = getActiveIctTasksForLibrary(tasks);
	const currentAsOfDate = resolveCriticalTasksAsOfDate(asOf);
	const previousAsOf = addCriticalTasksDays(currentAsOfDate, -30);
	const latestCompletions = buildLatestIctCompletionLookup(completions, currentAsOfDate);
	const currentReadiness = buildCriticalTasksReadinessCounts({
		personnel,
		activeTasks,
		latestCompletions,
		settings,
		asOf: currentAsOfDate,
		comparisonMos: selectTopMosByHeadcount(personnel, 3)
	});
	const previousReadiness = buildCriticalTasksReadinessCounts({
		personnel,
		activeTasks,
		completions,
		settings,
		asOf: previousAsOf
	});
	const expiringSoon = countCriticalTasksExpiringSoon({
		personnel,
		activeTasks,
		latestCompletions,
		settings,
		asOf: currentAsOfDate
	});
	const atRiskSoldiers = buildDashboardRiskRows({
		personnel,
		activeTasks,
		completions,
		latestCompletions,
		settings,
		asOf: currentAsOfDate,
		limit: 3
	});
	const tasksBelowThreshold = buildDashboardTasksBelowThreshold({
		personnel,
		activeTasks,
		latestCompletions,
		settings,
		asOf: currentAsOfDate,
		limit: 3
	});
	const expiringSoonWindowDays = normalizeCriticalTasksSettings(settings).expiringSoonWarningDays;

	return {
		hasActiveTasks: activeTasks.length > 0,
		kpis: {
			overallReadiness: {
				percent: currentReadiness.overall.percent,
				deltaPercent: currentReadiness.overall.percent - previousReadiness.overall.percent,
				readyCount: currentReadiness.overall.readyCount,
				applicableCount: currentReadiness.overall.applicableCount
			},
			soldiersBelow70: {
				count: atRiskSoldiers.soldiersBelowThresholdCount,
				totalApplicable: atRiskSoldiers.totalApplicable,
				thresholdPercent: CRITICAL_TASK_READINESS_THRESHOLD_PERCENT
			},
			tasksExpiringSoon: {
				...expiringSoon,
				windowDays: expiringSoonWindowDays
			},
			tasksBelowThreshold: {
				count: tasksBelowThreshold.count,
				thresholdPercent: CRITICAL_TASK_READINESS_THRESHOLD_PERCENT
			}
		},
		mosReadiness: currentReadiness.mosReadiness,
		readinessTrend: buildDashboardReadinessTrend({
			personnel,
			activeTasks,
			completions,
			settings,
			asOf: currentAsOfDate
		}),
		projectedReadinessAtMonth6: buildDashboardProjectedReadiness({
			personnel,
			activeTasks,
			completions,
			settings,
			asOf: currentAsOfDate
		}),
		tasksBelowThreshold,
		atRiskSoldiers: {
			totalApplicable: atRiskSoldiers.totalApplicable,
			rows: atRiskSoldiers.rows
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
	const latestCompletions = buildLatestIctCompletionLookup(completions, asOf);
	const comparisonMos = [
		...personnel.reduce((map, person) => {
			if (!person.archivedAt) {
				const mos = normalizeCriticalTasksMosName(person.mos);
				map.set(mos, (map.get(mos) ?? 0) + 1);
			}
			return map;
		}, new Map<string, number>())
	]
		.map(([mos, personnelCount]) => ({ mos, personnelCount }))
		.sort((left, right) => left.mos.localeCompare(right.mos));

	const readinessCounts = buildCriticalTasksReadinessCounts({
		personnel,
		activeTasks,
		latestCompletions,
		settings,
		asOf,
		comparisonMos
	});

	const readinessByMos = readinessCounts.mosReadiness
		.filter((row) => row.applicableCount > 0)
		.map(({ mos, applicableCount, readyCount, readinessPercent }) => ({
			mos,
			applicableCount,
			readyCount,
			readinessPercent
		}));
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
		overallReadinessPercent: readinessCounts.overall.percent,
		readinessByMos,
		bestPerformingMos: byBest[0],
		worstPerformingMos: byWorst[0],
		completionTrend: completionTrend ?? buildCompletionTrend(personnel, activeTasks, completions)
	};
}

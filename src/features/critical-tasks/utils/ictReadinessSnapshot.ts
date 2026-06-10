import type {
	CriticalTasksSettingsInput,
	IctStatus,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';
import type { Personnel } from '$lib/types';
import { getIctStatus } from './ictStatus';
import { isIctTaskApplicableToMos } from './ictTaskLibrary';
import {
	tallyReadiness,
	tallyReadinessBy,
	type ReadinessFact,
	type ReadinessTallyConfig
} from '$lib/domain/readinessRollup';
import { formatDate, parseDate } from '$lib/utils/dates';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const CRITICAL_TASK_READINESS_THRESHOLD_PERCENT = 70;

/** The one home for Critical Tasks' "ready" definition. */
export const ICT_READY_STATES = ['current', 'expiring-soon'] as const satisfies readonly IctStatus[];

/**
 * Critical Tasks' Readiness Rollup convention: ready = current OR
 * expiring-soon, applicability is gated at fact emission rather than by state,
 * and counting surfaces report 0% on an empty denominator. The MOS × category
 * readiness matrix diverges to a null zero-applicable percent and declares
 * that explicitly at its own call site (see CONTEXT.md).
 */
export const ICT_READINESS_ROLLUP: ReadinessTallyConfig<IctStatus, 0> = {
	readyStates: ICT_READY_STATES,
	zeroApplicablePercent: 0
};

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

export function isCriticalTaskStatusReady(status: IctStatus): boolean {
	return (ICT_READY_STATES as readonly IctStatus[]).includes(status);
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

interface IctReadinessFactInput {
	activeTasks: IctTask[];
	latestCompletions: Map<string, PersonnelIctCompletion>;
	settings?: CriticalTasksSettingsInput | null;
	asOf?: string | Date;
}

function appendPersonIctReadinessFacts(
	facts: ReadinessFact<IctStatus>[],
	person: Pick<Personnel, 'id' | 'mos'>,
	input: IctReadinessFactInput
): void {
	for (const task of input.activeTasks) {
		if (!isIctTaskApplicableToMos(task, person.mos)) {
			continue;
		}

		const completion = input.latestCompletions.get(ictCompletionKey(person.id, task.id));
		facts.push({
			subjectKey: person.id,
			requirementKey: task.id,
			state: getIctStatus(completion?.completedAt ?? null, task, input.settings, input.asOf).status
		});
	}
}

/**
 * Classifies every applicable (Soldier × Critical Task) pair into a Readiness
 * Rollup fact. Owns the gates that run BEFORE the fold — archived Personnel
 * Records are skipped in-loop and MOS-inapplicable tasks emit no fact — and
 * the getIctStatus classification, including asOf time travel.
 */
export function buildIctReadinessFacts(
	input: IctReadinessFactInput & { personnel: Personnel[] }
): ReadinessFact<IctStatus>[] {
	const facts: ReadinessFact<IctStatus>[] = [];
	for (const person of input.personnel) {
		if (person.archivedAt) {
			continue;
		}

		appendPersonIctReadinessFacts(facts, person, input);
	}

	return facts;
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
	const facts: ReadinessFact<IctStatus>[] = [];
	appendPersonIctReadinessFacts(facts, input.person, {
		activeTasks: input.activeTasks,
		latestCompletions,
		settings: input.settings,
		asOf: input.asOf
	});
	const tally = tallyReadiness(facts, ICT_READINESS_ROLLUP);

	return {
		readinessPercent: tally.percent,
		applicableCount: tally.applicable,
		readyCount: tally.ready,
		attentionCount: tally.applicable - tally.ready,
		currentCount: tally.stateCounts.get('current') ?? 0,
		expiringSoonCount: tally.stateCounts.get('expiring-soon') ?? 0,
		expiredCount: tally.stateCounts.get('expired') ?? 0,
		notRecordedCount: tally.stateCounts.get('not-recorded') ?? 0
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
	const personnelById = new Map(input.personnel.map((person) => [person.id, person]));
	const tasksById = new Map(input.activeTasks.map((task) => [task.id, task]));

	// One classification pass, three folds: overall, per Soldier, per task. A
	// Soldier with zero applicable tasks emits no facts and so gets no row.
	const facts = buildIctReadinessFacts({ ...input, latestCompletions });
	const overall = tallyReadiness(facts, ICT_READINESS_ROLLUP);
	const bySoldier = tallyReadinessBy(facts, ICT_READINESS_ROLLUP, (fact) => fact.subjectKey);
	const byTask = tallyReadinessBy(facts, ICT_READINESS_ROLLUP, (fact) => fact.requirementKey);

	const atRiskSoldierRows: IctAtRiskSoldierRow[] = [];
	let soldiersBelowThresholdCount = 0;
	for (const [personnelId, tally] of bySoldier) {
		const person = personnelById.get(personnelId)!;
		const lastUpdate = lastIctUpdates.get(personnelId) ?? null;
		atRiskSoldierRows.push({
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
		});

		if (tally.percent < CRITICAL_TASK_READINESS_THRESHOLD_PERCENT) {
			soldiersBelowThresholdCount += 1;
		}
	}
	atRiskSoldierRows.sort(compareAtRiskSoldierRows);

	const tasksBelowThresholdRows: IctTaskBelowThresholdRow[] = [];
	for (const [taskId, tally] of byTask) {
		if (tally.applicable === 0 || tally.percent >= CRITICAL_TASK_READINESS_THRESHOLD_PERCENT) {
			continue;
		}

		const task = tasksById.get(taskId)!;
		tasksBelowThresholdRows.push({
			taskId,
			taskCode: task.taskCode,
			taskName: task.title,
			percentComplete: tally.percent,
			soldierGapCount: tally.applicable - tally.ready,
			applicableCount: tally.applicable,
			completeCount: tally.ready
		});
	}
	tasksBelowThresholdRows.sort(compareBelowThresholdTaskRows);

	return {
		percent: overall.percent,
		readyCount: overall.ready,
		applicableCount: overall.applicable,
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
	// The expiring-soon window test is the `expiring-soon` classification:
	// getIctStatus marks a pair expiring-soon exactly when its expiration date
	// falls inside [asOf, asOf + expiringSoonWarningDays].
	const facts = buildIctReadinessFacts(input);
	const overall = tallyReadiness(facts, ICT_READINESS_ROLLUP);
	const bySoldier = tallyReadinessBy(facts, ICT_READINESS_ROLLUP, (fact) => fact.subjectKey);

	let affectedSoldiers = 0;
	for (const tally of bySoldier.values()) {
		if ((tally.stateCounts.get('expiring-soon') ?? 0) > 0) {
			affectedSoldiers += 1;
		}
	}

	return {
		count: overall.stateCounts.get('expiring-soon') ?? 0,
		affectedSoldiers
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
	const mosByPersonnelId = new Map<string, string>();
	for (const person of input.personnel) {
		if (person.archivedAt) {
			continue;
		}

		mosByPersonnelId.set(person.id, normalizeCriticalTasksMosName(person.mos));
	}

	const facts = buildIctReadinessFacts({
		personnel: input.personnel,
		activeTasks: input.activeTasks,
		latestCompletions,
		settings: input.settings,
		asOf: input.asOf
	});
	const overall = tallyReadiness(facts, ICT_READINESS_ROLLUP);
	// Seeds keep every comparison MOS present (at zero) even when none of its
	// Soldiers have applicable tasks; non-comparison MOS keys are simply unread.
	const byMos = tallyReadinessBy(facts, ICT_READINESS_ROLLUP, (fact) => mosByPersonnelId.get(fact.subjectKey)!, {
		seedKeys: comparisonMos.map(({ mos }) => mos)
	});

	return {
		overall: {
			percent: overall.percent,
			readyCount: overall.ready,
			applicableCount: overall.applicable
		},
		mosReadiness: comparisonMos.map(({ mos, personnelCount }) => {
			const tally = byMos.get(mos)!;
			return {
				mos,
				personnelCount,
				readinessPercent: tally.percent,
				readyCount: tally.ready,
				applicableCount: tally.applicable
			};
		})
	};
}

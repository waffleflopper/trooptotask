import { evaluateUpcomingLosses, type LossCandidate, type UpcomingLossRecord } from '$features/personnel/contracts';
import { formatDayMonth, formatDayMonthYear } from '$lib/utils/dates';
import { nextCleanupRun, retentionDeletionDate } from '$lib/utils/retentionCutoff';

/** One group's training readiness today, as the Training Reports heat map grades it. */
export interface GroupReadiness {
	name: string;
	ready: number;
	applicable: number;
	percent: number;
}

/** The saved policies and the archive date come with the page; the group readiness streams. */
export interface PoliciesSettingsData {
	lossWarningWindowDays: number;
	trainingReadinessGoalPercent: number;
	archiveRetentionMonths: number;
	/** The viewer's day, which the loss window counts from. */
	today: string;
	/** Active people with an ETS or DEROS date; null when Losses and awards is off for the unit. */
	lossCandidates: LossCandidate[] | null;
	oldestArchivedAt: string | null;
	/** Null when Training is off for the unit. */
	groupReadiness: Promise<GroupReadiness[]> | null;
}

function people(n: number): string {
	if (n === 0) return 'no one is';
	return n === 1 ? '1 person is' : `${n} people are`;
}

function nameFirstTwo(names: string[], rest: (n: number) => string): string {
	if (names.length === 1) return names[0];
	if (names.length === 2) return `${names[0]} and ${names[1]}`;
	return `${names[0]}, ${names[1]} and ${rest(names.length - 2)}`;
}

function lossName(loss: UpcomingLossRecord, today: string): string {
	const sameYear = loss.targetDate.slice(0, 4) === today.slice(0, 4);
	const date = sameYear ? formatDayMonth(loss.targetDate) : formatDayMonthYear(loss.targetDate);
	return `${loss.personName}'s ${loss.triggerType === 'ETS' ? 'ETS' : 'PCS'} on ${date}`;
}

/** Who the dashboard flags at `days`, compared with the saved window when the two differ. */
export function lossWindowSentence(
	candidates: readonly LossCandidate[],
	days: number,
	savedDays: number,
	today: string
): string {
	const flagged = evaluateUpcomingLosses(candidates, days, today);
	const lead = `At ${days} days, ${people(flagged.length)} flagged today`;
	if (days === savedDays) return `${lead}.`;

	const before = evaluateUpcomingLosses(candidates, savedDays, today);
	const was = `${lead} (was ${before.length} at ${savedDays}).`;
	const after = new Set(flagged.map((loss) => loss.personId));
	const earlier = new Set(before.map((loss) => loss.personId));
	const dropped = before.filter((loss) => !after.has(loss.personId));
	const joined = flagged.filter((loss) => !earlier.has(loss.personId));
	const changed = dropped.length > 0 ? dropped : joined;
	if (changed.length === 0) return was;

	const names = nameFirstTwo(
		changed.map((loss) => lossName(loss, today)),
		(n) => (n === 1 ? '1 other' : `${n} others`)
	);
	return `${was} ${names} would ${dropped.length > 0 ? 'drop off' : 'join'}.`;
}

/** Below the goal is the heat map's test, on the exact share rather than the rounded percent. */
export function groupsUnderGoalSentence(groups: readonly GroupReadiness[], goal: number): string {
	if (groups.length === 0) return 'No group has required training to measure yet.';
	const under = groups.filter((group) => group.ready * 100 < goal * group.applicable);
	if (under.length === 0) return 'Today every group meets it.';
	const names = nameFirstTwo(
		under.map((group) => `${group.name} (${group.percent}%)`),
		(n) => (n === 1 ? '1 more group' : `${n} more groups`)
	);
	return `Today that's ${names}.`;
}

/** Dates the next deletion on the day of the cleanup run, which runs on UTC time. */
export function retentionSentence(oldestArchivedAt: string | null, months: number, now: Date): string {
	const lead = `Archived people are deleted ${months} ${months === 1 ? 'month' : 'months'} after archiving.`;
	if (oldestArchivedAt === null) return `${lead} No one is archived right now.`;
	const due = retentionDeletionDate(oldestArchivedAt, months);
	const next = nextCleanupRun(now);
	const run = due > next ? due : next;
	return `${lead} The next one goes on ${formatDayMonthYear(run.toISOString().slice(0, 10))}.`;
}

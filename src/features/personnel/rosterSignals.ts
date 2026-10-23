import { coveredMonthsOf } from './counselingCoverage';
import { dueLabel } from './logModel';
import { buildPersonnelAttention } from './personnelAttention';
import type { Personnel } from './personnel.types';
import type { AttentionInput, AttentionItem } from './personnelReadiness.types';
import { evaluateUpcomingLosses, type UpcomingLossRecord } from './upcomingLoss';

/** The sources the roster signals lane reads. A source the unit turned off or the viewer cannot read is withheld. */
export type SignalSource = 'availability' | 'training' | 'criticalTasks' | 'evaluations' | 'followUps' | 'counseling';
export type SignalAccess = Readonly<Record<SignalSource, boolean>>;

/** A withheld fact was not read, so it is never shown as clear or present. */
export type Known<T> = { kind: 'known'; value: T } | { kind: 'withheld' };

export interface RosterStatusType {
	id: string;
	name: string;
	color: string;
	textColor: string;
	sortOrder: number;
}

export type TodayStatus = { kind: 'present' } | { kind: 'away'; statusTypeId: string };

/** The roster's compact form of a ranked attention item. Detail prose stays on the record. */
export type SignalItem =
	| {
			kind: 'training' | 'critical-task';
			status: 'expired' | 'missing' | 'expiring';
			title: string;
			days: number | null;
	  }
	| { kind: 'evaluation'; status: 'due'; title: string; days: number | null }
	| { kind: 'follow-ups'; status: 'overdue'; count: number };

export type SignalTone = 'red' | 'amber';

export type AttentionSummary =
	| { kind: 'clear' }
	| { kind: 'attention'; first: SignalItem; otherCount: number; worst: SignalTone };

/** The first-ranked item that matches a chip, and how many other issues match it. */
export interface ChipMatch {
	item: SignalItem;
	otherCount: number;
}

export interface CoreMatches {
	expired?: ChipMatch;
	expiring?: ChipMatch;
	'follow-ups'?: ChipMatch;
	counseling?: true;
}

export interface OpenFollowUp {
	id: string;
	title: string;
	dueDate: string | null;
}

/** The person's most urgent open follow-up and how many are open, so a leader does not log a duplicate. */
export interface OpenFollowUpSignal {
	count: number;
	first: OpenFollowUp | null;
}

export interface PersonSignalCore {
	personnelId: string;
	today: Known<TodayStatus>;
	attention: Known<AttentionSummary>;
	matches: CoreMatches;
	openFollowUps: Known<OpenFollowUpSignal>;
}

/** One read of the lane: the day it was computed for, what the viewer could read, and one core per visible Person. */
export interface RosterSignalRead {
	asOf: string;
	access: SignalAccess;
	statusTypes: RosterStatusType[];
	people: PersonSignalCore[];
}

/** What the lane asks a source: the viewer's day, and the People to read, or null for the whole roster. */
export interface RosterSourceQuery {
	asOf: string;
	personnelIds: readonly string[] | null;
}

/** One source's facts for each active Person the viewer may read there. A Person missing from the map is withheld. */
export type RosterSourceRead<T> = ReadonlyMap<string, T>;

export const NO_SIGNAL_ACCESS: SignalAccess = {
	availability: false,
	training: false,
	criticalTasks: false,
	evaluations: false,
	followUps: false,
	counseling: false
};

/** Invalidating this reruns only the signals lane, never the roster read. */
export const PERSONNEL_SIGNALS_DEPENDENCY = 'app:personnel-signals';
/** The most People one signals refresh reads; past it the model reloads the lane. */
export const ROSTER_SIGNAL_BATCH_LIMIT = 500;
export const EXPIRING_CHIP_DAYS = 30;
export const LOSS_CHIP_DAYS = 90;

const OFF = { ok: false, off: true } as const;

function compactItem(item: AttentionItem): SignalItem | null {
	switch (item.kind) {
		case 'training':
		case 'critical-task':
			return { kind: item.kind, status: item.status, title: item.title, days: item.daysUntilDue };
		case 'evaluation':
			return { kind: 'evaluation', status: 'due', title: item.title, days: item.daysUntilDue };
		case 'loss':
			return null;
	}
}

export function signalTone(item: SignalItem): SignalTone {
	if (item.kind === 'evaluation') return item.days !== null && item.days < 0 ? 'red' : 'amber';
	return item.status === 'expiring' ? 'amber' : 'red';
}

function weight(item: SignalItem): number {
	return item.kind === 'follow-ups' ? item.count : 1;
}

function chipMatch(items: readonly SignalItem[], matches: (item: SignalItem) => boolean): ChipMatch | undefined {
	const matching = items.filter(matches);
	if (matching.length === 0) return undefined;
	const total = matching.reduce((sum, item) => sum + weight(item), 0);
	return { item: matching[0], otherCount: total - weight(matching[0]) };
}

function isExpiredOrMissing(item: SignalItem): boolean {
	return (item.kind === 'training' || item.kind === 'critical-task') && item.status !== 'expiring';
}

function isExpiringSoon(item: SignalItem): boolean {
	if (item.kind === 'evaluation') return true;
	return (
		(item.kind === 'training' || item.kind === 'critical-task') &&
		item.status === 'expiring' &&
		item.days !== null &&
		item.days >= 0 &&
		item.days <= EXPIRING_CHIP_DAYS
	);
}

/**
 * One Person's signals from the feature builders' results. Overdue follow-ups rank after every readiness item, and
 * a withheld source contributes nothing rather than reading as clear.
 */
export function buildPersonSignalCore(input: {
	personnelId: string;
	asOf: string;
	today: Known<TodayStatus>;
	training: AttentionInput['training'];
	criticalTasks: AttentionInput['criticalTasks'];
	evaluation: AttentionInput['evaluation'];
	openFollowUps: Known<readonly OpenFollowUp[]>;
	counselingDates: Known<readonly string[]>;
}): PersonSignalCore {
	const ranked = buildPersonnelAttention({
		training: input.training,
		criticalTasks: input.criticalTasks,
		evaluation: input.evaluation,
		loss: OFF,
		onboarding: OFF
	}).items.flatMap((item) => compactItem(item) ?? []);
	const openFollowUps = input.openFollowUps.kind === 'known' ? input.openFollowUps.value : [];
	const overdue = openFollowUps.filter((followUp) => dueLabel(followUp.dueDate, input.asOf).overdue).length;
	const items: SignalItem[] =
		overdue > 0 ? [...ranked, { kind: 'follow-ups', status: 'overdue', count: overdue }] : ranked;

	const attentionRead =
		input.training.ok || input.criticalTasks.ok || input.evaluation.ok || input.openFollowUps.kind === 'known';
	const total = items.reduce((sum, item) => sum + weight(item), 0);
	const attention: Known<AttentionSummary> = !attentionRead
		? { kind: 'withheld' }
		: {
				kind: 'known',
				value:
					items.length === 0
						? { kind: 'clear' }
						: {
								kind: 'attention',
								first: items[0],
								otherCount: total - weight(items[0]),
								worst: items.some((item) => signalTone(item) === 'red') ? 'red' : 'amber'
							}
			};

	const matches: CoreMatches = {};
	const expired = chipMatch(items, isExpiredOrMissing);
	if (expired) matches.expired = expired;
	const expiring = chipMatch(items, isExpiringSoon);
	if (expiring) matches.expiring = expiring;
	const followUps = chipMatch(items, (item) => item.kind === 'follow-ups');
	if (followUps) matches['follow-ups'] = followUps;
	if (input.counselingDates.kind === 'known' && coveredMonthsOf(input.counselingDates.value, input.asOf).length === 0) {
		matches.counseling = true;
	}

	return {
		personnelId: input.personnelId,
		today: input.today,
		attention,
		matches,
		openFollowUps:
			input.openFollowUps.kind === 'known'
				? { kind: 'known', value: { count: openFollowUps.length, first: openFollowUps[0] ?? null } }
				: { kind: 'withheld' }
	};
}

export interface RosterLoss {
	/** Inside the unit's loss window: the roster badge. */
	badge: UpcomingLossRecord | null;
	/** Inside the fixed chip window, whatever the unit's window. */
	chip: UpcomingLossRecord | null;
}

/** Losses come from the roster's own ETS and PCS dates, so they paint with the roster and follow its edits. */
export function projectRosterLosses(input: {
	people: readonly Personnel[];
	asOf: string;
	/** Null when the unit's window could not be read: no badge, but the fixed chip window still applies. */
	lossWarningWindowDays: number | null;
	lossesEnabled: boolean;
	awardTrackingAcknowledgedPersonnelIds: readonly string[];
}): ReadonlyMap<string, RosterLoss> {
	const losses = new Map<string, RosterLoss>();
	if (!input.lossesEnabled) return losses;
	const options = { awardTrackingAcknowledgedPersonnelIds: input.awardTrackingAcknowledgedPersonnelIds };
	const entry = (id: string) => losses.get(id) ?? { badge: null, chip: null };
	if (input.lossWarningWindowDays !== null) {
		for (const record of evaluateUpcomingLosses(input.people, input.lossWarningWindowDays, input.asOf, options)) {
			losses.set(record.personId, { ...entry(record.personId), badge: record });
		}
	}
	for (const record of evaluateUpcomingLosses(input.people, LOSS_CHIP_DAYS, input.asOf, options)) {
		losses.set(record.personId, { ...entry(record.personId), chip: record });
	}
	return losses;
}

/** `ETS · 41d` or `PCS · 12d`. */
export function lossBadgeLabel(record: UpcomingLossRecord): string {
	return `${record.triggerType === 'ETS' ? 'ETS' : 'PCS'} · ${record.daysRemaining}d`;
}

export type RosterChip = 'expired' | 'expiring' | 'follow-ups' | 'not-present' | 'losses' | 'counseling';
export const ROSTER_CHIPS: readonly RosterChip[] = [
	'expired',
	'expiring',
	'follow-ups',
	'not-present',
	'losses',
	'counseling'
];

export type RosterFilter =
	| { kind: 'chip'; chip: RosterChip }
	| { kind: 'present' }
	| { kind: 'status'; statusTypeId: string };

/** A Person's signals on the page: the server core completed with the roster's losses. */
export interface PersonRosterSignals extends PersonSignalCore {
	loss: RosterLoss | null;
}

export type SignalRow = { kind: 'pending' } | { kind: 'failed' } | { kind: 'ready'; value: PersonRosterSignals };

export function chipAvailable(chip: RosterChip, access: SignalAccess, lossesEnabled: boolean): boolean {
	switch (chip) {
		case 'expired':
			return access.training || access.criticalTasks;
		case 'expiring':
			return access.training || access.criticalTasks || access.evaluations;
		case 'follow-ups':
			return access.followUps;
		case 'not-present':
			return access.availability;
		case 'losses':
			return lossesEnabled;
		case 'counseling':
			return access.counseling;
	}
}

export function matchesRosterFilter(row: PersonRosterSignals, filter: RosterFilter): boolean {
	const today = row.today.kind === 'known' ? row.today.value : null;
	switch (filter.kind) {
		case 'present':
			return today?.kind === 'present';
		case 'status':
			return today?.kind === 'away' && today.statusTypeId === filter.statusTypeId;
		case 'chip':
			switch (filter.chip) {
				case 'not-present':
					return today?.kind === 'away';
				case 'losses':
					return Boolean(row.loss?.chip);
				default:
					return Boolean(row.matches[filter.chip]);
			}
	}
}

export interface StatusCount {
	type: RosterStatusType;
	count: number;
}

export interface RosterSignalSummary {
	/** Distinct People counted. */
	people: number;
	presence: Known<{ present: number; byStatus: StatusCount[] }>;
	attention: Known<{ people: number; worst: SignalTone | null }>;
	chips: { chip: RosterChip; people: number }[];
}

export type SummaryState = { kind: 'pending' } | { kind: 'failed' } | { kind: 'ready'; value: RosterSignalSummary };

/** One pass over distinct People. The strip, the chips and a Group header all count through this. */
export function summarizeRosterSignals(input: {
	rows: readonly PersonRosterSignals[];
	access: SignalAccess;
	lossesEnabled: boolean;
	statusTypes: readonly RosterStatusType[];
}): RosterSignalSummary {
	const rows = [...new Map(input.rows.map((row) => [row.personnelId, row])).values()];
	let presenceKnown = false;
	let present = 0;
	const away = new Map<string, number>();
	let attentionKnown = false;
	let attentionPeople = 0;
	let worst: SignalTone | null = null;
	const chips = ROSTER_CHIPS.filter((chip) => chipAvailable(chip, input.access, input.lossesEnabled));
	const chipCounts = new Map(chips.map((chip) => [chip, 0]));

	for (const row of rows) {
		if (row.today.kind === 'known') {
			presenceKnown = true;
			const today = row.today.value;
			if (today.kind === 'present') present++;
			else away.set(today.statusTypeId, (away.get(today.statusTypeId) ?? 0) + 1);
		}
		if (row.attention.kind === 'known') {
			attentionKnown = true;
			const attention = row.attention.value;
			if (attention.kind === 'attention') {
				attentionPeople++;
				if (attention.worst === 'red' || worst === null) worst = attention.worst;
			}
		}
		for (const chip of chips) {
			if (matchesRosterFilter(row, { kind: 'chip', chip })) chipCounts.set(chip, (chipCounts.get(chip) ?? 0) + 1);
		}
	}

	return {
		people: rows.length,
		presence:
			input.access.availability && presenceKnown
				? {
						kind: 'known',
						value: {
							present,
							byStatus: input.statusTypes.flatMap((type) => {
								const count = away.get(type.id);
								return count ? [{ type, count }] : [];
							})
						}
					}
				: { kind: 'withheld' },
		attention: attentionKnown ? { kind: 'known', value: { people: attentionPeople, worst } } : { kind: 'withheld' },
		chips: chips.map((chip) => ({ chip, people: chipCounts.get(chip) ?? 0 }))
	};
}

export type RosterAttentionCell =
	| { kind: 'skeleton' }
	| { kind: 'blank' }
	| { kind: 'clear' }
	/** `more` counts the person's other items, shown apart so a truncated item never hides it. */
	| { kind: 'item'; text: string; more: number; tone: SignalTone };

function itemText(item: SignalItem): string {
	switch (item.kind) {
		case 'training':
		case 'critical-task':
			return `${item.title} ${item.status}`;
		case 'evaluation':
			return `${item.title} ${item.days !== null && item.days < 0 ? 'overdue' : 'due'}`;
		case 'follow-ups':
			return `${item.count} follow-up${item.count === 1 ? '' : 's'} overdue`;
	}
}

function matchCell(match: ChipMatch): RosterAttentionCell {
	return { kind: 'item', text: itemText(match.item), more: match.otherCount, tone: signalTone(match.item) };
}

/** The Needs attention cell: the most urgent item, or the item that matched an active chip. */
export function rosterAttentionCell(row: SignalRow, filter: RosterFilter | null = null): RosterAttentionCell {
	if (row.kind === 'pending') return { kind: 'skeleton' };
	if (row.kind === 'failed') return { kind: 'blank' };
	const signals = row.value;
	if (filter?.kind === 'chip') {
		if (filter.chip === 'counseling' && signals.matches.counseling) {
			return { kind: 'item', text: 'Counseling due', more: 0, tone: 'amber' };
		}
		if (filter.chip === 'losses' && signals.loss?.chip) {
			const loss = signals.loss.chip;
			return { kind: 'item', text: `${lossBadgeLabel(loss)} left`, more: 0, tone: 'amber' };
		}
		const match =
			filter.chip === 'expired' || filter.chip === 'expiring' || filter.chip === 'follow-ups'
				? signals.matches[filter.chip]
				: undefined;
		if (match) return matchCell(match);
	}
	if (signals.attention.kind === 'withheld') return { kind: 'blank' };
	const attention = signals.attention.value;
	if (attention.kind === 'clear') return { kind: 'clear' };
	return matchCell({ item: attention.first, otherCount: attention.otherCount });
}

export type RosterStatusDot =
	| { kind: 'skeleton' }
	| { kind: 'none' }
	| { kind: 'present' }
	| { kind: 'away'; type: RosterStatusType };

export function rosterStatusDot(row: SignalRow, statusTypes: readonly RosterStatusType[]): RosterStatusDot {
	if (row.kind === 'pending') return { kind: 'skeleton' };
	if (row.kind === 'failed' || row.value.today.kind === 'withheld') return { kind: 'none' };
	const today = row.value.today.value;
	if (today.kind === 'present') return { kind: 'present' };
	const type = statusTypes.find((candidate) => candidate.id === today.statusTypeId);
	return type ? { kind: 'away', type } : { kind: 'none' };
}

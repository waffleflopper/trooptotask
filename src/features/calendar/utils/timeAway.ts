import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import {
	buildGroupTree,
	comparePersonnelByRankThenName,
	groupRows,
	type Group,
	type Personnel
} from '$features/personnel/contracts';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';

/** How far past the span end the report looks for the next time a person goes out. */
export const NEXT_OUT_WINDOW_DAYS = 60;

export interface TimeAwayInput {
	/** Everyone counted, already narrowed by the Group and MOS filters. */
	personnel: Personnel[];
	/** The span's entries and those after it; only the span's days are counted, the rest only feed `nextOut`. */
	entries: AvailabilityEntry[];
	statusTypes: readonly StatusType[];
	/** Only entries of these Status Types make a person away. */
	awayStatusTypeIds: ReadonlySet<string>;
	groups: readonly Group[];
	/** Shows each Group's sub-groups below it. */
	showSubGroups: boolean;
	startDate: string;
	endDate: string;
}

export interface StatusDays {
	statusTypeId: string;
	days: number;
}

/** The next away day after the span, with the status of the entry that holds it. */
export interface NextOut {
	statusTypeId: string;
	date: string;
	/** True when the person is away on the span's last day and the day after, so they never came back. */
	ongoing: boolean;
}

export interface PersonTimeAway {
	person: Personnel;
	/** Days away in the span; each day counts once, under the first entry that covers it. */
	totalDays: number;
	/** In Status Type order; a status with no days is absent. The days sum to `totalDays`. */
	byStatus: StatusDays[];
	/** Still away past the span if `ongoing`, else the first departure after it. */
	nextOut: NextOut | null;
	/** The first day the person leaves again after being back, within the window after the span; null if they don't. */
	departsAgain: string | null;
}

export interface GroupTimeAway {
	/** A Group id, `hq:` and a Group id for its own people, or `unassigned`. */
	key: string;
	label: string;
	level: number;
	people: number;
	totalDays: number;
	/** Days away per person; 0 for an empty Group. */
	perPerson: number;
	/** The days away per person split by status, in Status Type order. */
	byStatus: { statusTypeId: string; perPerson: number }[];
}

export interface GroupTimeAwaySet {
	top: GroupTimeAway;
	below: GroupTimeAway[];
}

export interface StatusShare {
	statusTypeId: string;
	days: number;
	/** Of all days away, 0 to 1. */
	share: number;
}

export interface TimeAwayReport {
	spanDays: number;
	peopleCount: number;
	/** Every person times every day of the span. */
	personDays: number;
	awayDays: number;
	/** The share of person-days away, 0 to 1; 0 when nobody is counted. */
	awayShare: number;
	/** Days away per person across everyone counted. */
	averagePerPerson: number;
	neverAway: number;
	/** The largest status first, ties in Status Type order. */
	byStatus: StatusShare[];
	groups: GroupTimeAwaySet[];
	/** In rank then name order; rank them with `rankPeople`. */
	people: PersonTimeAway[];
}

const nextDay = (date: string): string => fromDayNumber(toDayNumber(date) + 1);
const previousDay = (date: string): string => fromDayNumber(toDayNumber(date) - 1);

function personTimeAway(
	person: Personnel,
	entries: readonly AvailabilityEntry[],
	startDate: string,
	endDate: string,
	statusOrder: ReadonlyMap<string, number>
): PersonTimeAway {
	const start = toDayNumber(startDate);
	const end = toDayNumber(endDate);
	const seen = new Set<number>();
	const days = new Map<string, number>();

	for (const entry of entries) {
		if (entry.endDate >= startDate && entry.startDate <= endDate) {
			const first = Math.max(toDayNumber(entry.startDate), start);
			const last = Math.min(toDayNumber(entry.endDate), end);
			for (let day = first; day <= last; day++) {
				if (seen.has(day)) continue;
				seen.add(day);
				days.set(entry.statusTypeId, (days.get(entry.statusTypeId) ?? 0) + 1);
			}
		}
	}

	// Back-to-back or overlapping entries are one stretch away, so continuity is read across entries, not per entry.
	const awayOn = (date: string) => entries.some((entry) => entry.startDate <= date && date <= entry.endDate);
	const dayAfterSpan = nextDay(endDate);
	const continuing = awayOn(endDate)
		? entries.find((entry) => entry.startDate <= dayAfterSpan && dayAfterSpan <= entry.endDate)
		: undefined;
	const departure = entries
		.filter((entry) => entry.startDate > endDate && !awayOn(previousDay(entry.startDate)))
		.reduce<AvailabilityEntry | null>(
			(first, entry) => (first && first.startDate <= entry.startDate ? first : entry),
			null
		);
	const nextOut: NextOut | null = continuing
		? { statusTypeId: continuing.statusTypeId, date: dayAfterSpan, ongoing: true }
		: departure && { statusTypeId: departure.statusTypeId, date: departure.startDate, ongoing: false };

	return {
		person,
		totalDays: seen.size,
		byStatus: [...days]
			.map(([statusTypeId, count]) => ({ statusTypeId, days: count }))
			.sort((a, b) => (statusOrder.get(a.statusTypeId) ?? Infinity) - (statusOrder.get(b.statusTypeId) ?? Infinity)),
		nextOut,
		departsAgain: departure?.startDate ?? null
	};
}

function groupTimeAway(
	row: { key: string; label: string; level: number; items: Personnel[] },
	byPerson: ReadonlyMap<string, PersonTimeAway>,
	statusOrder: ReadonlyMap<string, number>
): GroupTimeAway {
	const people = row.items.length;
	const days = new Map<string, number>();
	let totalDays = 0;
	for (const item of row.items) {
		for (const status of byPerson.get(item.id)?.byStatus ?? []) {
			days.set(status.statusTypeId, (days.get(status.statusTypeId) ?? 0) + status.days);
			totalDays += status.days;
		}
	}
	return {
		key: row.key,
		label: row.label,
		level: row.level,
		people,
		totalDays,
		perPerson: people > 0 ? totalDays / people : 0,
		byStatus: [...days]
			.map(([statusTypeId, count]) => ({ statusTypeId, perPerson: count / people }))
			.sort((a, b) => (statusOrder.get(a.statusTypeId) ?? Infinity) - (statusOrder.get(b.statusTypeId) ?? Infinity))
	};
}

export function computeTimeAway(input: TimeAwayInput): TimeAwayReport {
	const { personnel, startDate, endDate } = input;
	const statusOrder = new Map(input.statusTypes.map((status, index) => [status.id, index]));
	const spanDays = toDayNumber(endDate) - toDayNumber(startDate) + 1;

	const entriesByPerson = new Map<string, AvailabilityEntry[]>();
	for (const entry of input.entries) {
		if (!input.awayStatusTypeIds.has(entry.statusTypeId)) continue;
		const list = entriesByPerson.get(entry.personnelId);
		if (list) list.push(entry);
		else entriesByPerson.set(entry.personnelId, [entry]);
	}

	const people = [...personnel]
		.sort(comparePersonnelByRankThenName)
		.map((person) => personTimeAway(person, entriesByPerson.get(person.id) ?? [], startDate, endDate, statusOrder));
	const byPerson = new Map(people.map((entry) => [entry.person.id, entry]));

	const awayDays = people.reduce((sum, entry) => sum + entry.totalDays, 0);
	const personDays = people.length * spanDays;
	const statusDays = new Map<string, number>();
	for (const entry of people) {
		for (const status of entry.byStatus) {
			statusDays.set(status.statusTypeId, (statusDays.get(status.statusTypeId) ?? 0) + status.days);
		}
	}

	const tree = buildGroupTree(input.groups);
	const groups = groupRows(tree, personnel, (person) => person.groupId, input.showSubGroups).map(
		(set): GroupTimeAwaySet => ({
			top: groupTimeAway(set.top, byPerson, statusOrder),
			below: set.below.map((row) => groupTimeAway(row, byPerson, statusOrder))
		})
	);

	return {
		spanDays,
		peopleCount: people.length,
		personDays,
		awayDays,
		awayShare: personDays > 0 ? awayDays / personDays : 0,
		averagePerPerson: people.length > 0 ? awayDays / people.length : 0,
		neverAway: people.filter((entry) => entry.totalDays === 0).length,
		byStatus: [...statusDays]
			.map(([statusTypeId, days]) => ({ statusTypeId, days, share: days / awayDays }))
			.sort(
				(a, b) =>
					b.days - a.days ||
					(statusOrder.get(a.statusTypeId) ?? Infinity) - (statusOrder.get(b.statusTypeId) ?? Infinity)
			),
		groups,
		people
	};
}

export interface TimeAwaySummary {
	/** People away `flagDays` or more. */
	flagged: number;
	/** Of the flagged, those who come back and go out again within the window after the span; someone still away is not counted. */
	flaggedOutAgain: number;
	/** The top-level Group with the most days away per person, the first on a tie; null when fewer than two have people. */
	busiestGroup: GroupTimeAway | null;
}

export function summarizeTimeAway(report: TimeAwayReport, flagDays: number): TimeAwaySummary {
	const flagged = report.people.filter((entry) => entry.totalDays >= flagDays);
	const populated = report.groups.map((set) => set.top).filter((group) => group.people > 0);
	return {
		flagged: flagged.length,
		flaggedOutAgain: flagged.filter((entry) => entry.departsAgain !== null).length,
		busiestGroup:
			populated.length < 2
				? null
				: populated.reduce((busiest, group) => (group.perPerson > busiest.perPerson ? group : busiest))
	};
}

export type PersonOrder = 'most' | 'least';

/** Most or least days away first; ties keep rank then name order. */
export function rankPeople(people: readonly PersonTimeAway[], order: PersonOrder): PersonTimeAway[] {
	const sign = order === 'most' ? -1 : 1;
	return [...people].sort(
		(a, b) => sign * (a.totalDays - b.totalDays) || comparePersonnelByRankThenName(a.person, b.person)
	);
}

/** A flag at a fraction of the span, so the choice keeps its meaning when the span changes. */
export const FLAG_CHOICES = [
	{ id: 'sixth', fraction: 1 / 6 },
	{ id: 'quarter', fraction: 1 / 4 },
	{ id: 'third', fraction: 1 / 3 },
	{ id: 'half', fraction: 1 / 2 }
] as const;
export type FlagChoiceId = (typeof FLAG_CHOICES)[number]['id'];
export const DEFAULT_FLAG_CHOICE: FlagChoiceId = 'third';

/** Whole days away that flag a person for a span of `spanDays`, at least 1. */
export function flagDays(spanDays: number, choice: FlagChoiceId): number {
	const fraction = FLAG_CHOICES.find((candidate) => candidate.id === choice)?.fraction ?? 1 / 3;
	return Math.max(1, Math.round(spanDays * fraction));
}

/** An axis from 0 to the first 1, 2 or 5 times a power of ten step multiple at or above `max`, with at most five steps. */
export function niceScale(max: number): { max: number; ticks: number[] } {
	if (!(max > 0)) return { max: 1, ticks: [0, 1] };
	let step = 1;
	for (let power = 1; ; power *= 10) {
		const found = [1, 2, 5].map((unit) => unit * power).find((candidate) => max / candidate <= 5);
		if (found !== undefined) {
			step = found;
			break;
		}
	}
	const top = Math.ceil(max / step) * step;
	return { max: top, ticks: Array.from({ length: top / step + 1 }, (_, index) => index * step) };
}

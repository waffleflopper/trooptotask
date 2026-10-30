import {
	compareOverlappingEntries,
	sortedStatusTypes,
	type AvailabilityEntry,
	type SpecialDay,
	type StatusType
} from '$features/calendar/contracts';
import {
	buildGroupTree,
	groupRows,
	hasSubGroups,
	type Group,
	type GroupRow,
	type Personnel
} from '$features/personnel/contracts';
import { availabilityPercent, isBelowStrengthFloor } from '$features/organization/contracts';
import { formatDayMonth } from '$lib/utils/dates';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import { availabilityRuns, backDate, type AvailabilityRun } from './availabilityRuns';

/** Up to this many people the strip draws a block and the out list a row per person. */
export const PEOPLE_MODE_LIMIT = 40;
/** Up to this many top-level groups all are listed; past it, the lowest `GROUPS_FOLDED_TO` show with their sub-groups. */
export const GROUPS_SHOWN_LIMIT = 6;
export const GROUPS_FOLDED_TO = 5;
const ORIGINS_SHOWN = 2;

export interface StrengthInputs {
	/** The viewer's day, "YYYY-MM-DD"; the first forecast day. */
	today: string;
	forecastDays: readonly string[];
	/** Active personnel inside the viewer's scope. */
	personnel: readonly Personnel[];
	availability: readonly AvailabilityEntry[];
	statusTypes: readonly StatusType[];
	specialDays: readonly SpecialDay[];
	groups: readonly Group[];
	floorPercent: number;
	/** Rows for sub-groups under each top-level Group; off rolls each subtree into one row. */
	showSubGroups?: boolean;
}

export interface StatusCount {
	statusTypeId: string;
	count: number;
}

export interface ForecastColumn {
	date: string;
	isToday: boolean;
	/** False on weekends and stored Special Days, which are never flagged. */
	isDutyDay: boolean;
	/** "Weekend" or the stored Special Day's name; null on a duty day. */
	offDutyLabel: string | null;
	assigned: number;
	available: number;
	/** People out that day per status, in catalog order, nonzero only. */
	byStatus: readonly StatusCount[];
	belowFloor: boolean;
}

export type ForecastHeadline =
	| { kind: 'underToday'; floorPercent: number; backAbove: string | null }
	| { kind: 'dips'; floorPercent: number; from: string; days: number }
	| { kind: 'steady'; min: number; max: number }
	| { kind: 'above'; min: number; max: number; lowest: string };

export interface StripSegment {
	/** Null for the available people. */
	statusTypeId: string | null;
	count: number;
}

export interface OutPersonRow {
	personnelId: string;
	name: string;
	statusTypeId: string;
	/** The first day the person is available again, "YYYY-MM-DD". */
	back: string;
	backLabel: string;
}

export interface OutStatusRow {
	statusTypeId: string;
	count: number;
	/** The largest source groups: "B Co 9 · HHC 6". */
	originsLabel: string;
	/** Source groups past those named. */
	moreOrigins: number;
	/** The soonest return: "back tomorrow", "2 back 23 Oct". */
	returnLabel: string;
}

export interface BottomLine {
	available: number;
	assigned: number;
	percent: number;
	belowFloor: boolean;
	mode: 'people' | 'counts';
	/** Available first, then each status in catalog order. */
	strip: readonly StripSegment[];
	/** Every person out today, grouped by status in catalog order. */
	outPeople: readonly OutPersonRow[];
	outByStatus: readonly OutStatusRow[];
	tomorrow: string;
}

export interface GroupStrengthRow {
	id: string;
	name: string;
	level: number;
	/** The row totals the rows below it. */
	subtotal: boolean;
	available: number;
	assigned: number;
	percent: number;
	belowFloor: boolean;
}

export interface GroupStrengthSet {
	top: GroupStrengthRow;
	/** The top row's HQ and sub-group rows in tree order; empty with sub-groups off. */
	below: readonly GroupStrengthRow[];
}

/**
 * `compact` wraps the rows into a flowing strip whose height follows the width; `list` draws one fixed-height row per
 * Group, so its height is the same at every width.
 */
export function groupStripLayout(groups: GroupStrength, mode: 'people' | 'counts'): 'compact' | 'list' {
	return mode === 'people' && !groups.sets.some((set) => set.below.length > 0) ? 'compact' : 'list';
}

export interface GroupStrength {
	/** Lowest top-level percent first, Unassigned last. */
	sets: readonly GroupStrengthSet[];
	/** How many sets show before "All N groups". */
	shown: number;
	/** Whether the reader's Groups have sub-groups to show or roll up. */
	hasSubGroups: boolean;
}

export interface StrengthBand {
	floorPercent: number;
	bottomLine: BottomLine;
	forecast: readonly ForecastColumn[];
	headline: ForecastHeadline;
	/** Status types out on any forecast day, in catalog order. */
	legend: readonly StatusType[];
	statusById: ReadonlyMap<string, StatusType>;
	groups: GroupStrength;
}

/** Per forecast day, the entry each person out that day shows. */
type DayStatuses = ReadonlyMap<string, ReadonlyMap<string, AvailabilityEntry>>;

export function buildStrengthBand(inputs: StrengthInputs): StrengthBand {
	const statusById = new Map(inputs.statusTypes.map((type) => [type.id, type]));
	const statuses = indexDayStatuses(inputs);
	const forecast = buildForecastColumns(inputs, statuses);
	const inUse = new Set(forecast.flatMap((column) => column.byStatus.map((entry) => entry.statusTypeId)));

	return {
		floorPercent: inputs.floorPercent,
		bottomLine: buildBottomLine(inputs, statuses, forecast),
		forecast,
		headline: pickForecastHeadline(forecast, inputs.floorPercent),
		legend: sortedStatusTypes(inputs.statusTypes).filter((type) => inUse.has(type.id)),
		statusById,
		groups: buildGroupStrength(inputs, statuses.get(inputs.today) ?? new Map())
	};
}

function indexDayStatuses(inputs: StrengthInputs): DayStatuses {
	const statusRank = new Map(sortedStatusTypes(inputs.statusTypes).map((type, index) => [type.id, index]));
	const inScope = new Set(inputs.personnel.map((person) => person.id));
	const days = new Map(inputs.forecastDays.map((day) => [day, new Map<string, AvailabilityEntry>()]));
	if (inputs.forecastDays.length === 0) return days;
	const first = toDayNumber(inputs.forecastDays[0]);
	const last = toDayNumber(inputs.forecastDays[inputs.forecastDays.length - 1]);

	for (const entry of inputs.availability) {
		if (!inScope.has(entry.personnelId)) continue;
		const from = Math.max(toDayNumber(entry.startDate), first);
		const to = Math.min(toDayNumber(entry.endDate), last);
		for (let day = from; day <= to; day++) {
			const out = days.get(fromDayNumber(day));
			if (!out) continue;
			const shown = out.get(entry.personnelId);
			if (!shown || compareOverlappingEntries(entry, shown, statusRank) < 0) out.set(entry.personnelId, entry);
		}
	}
	return days;
}

/** One column per forecast day: who is out by status, and whether a duty day falls below the floor. */
export function buildForecastColumns(inputs: StrengthInputs, statuses = indexDayStatuses(inputs)): ForecastColumn[] {
	const specialDayNames = new Map(inputs.specialDays.map((day) => [day.date, day.name]));
	const order = sortedStatusTypes(inputs.statusTypes);
	const assigned = inputs.personnel.length;

	return inputs.forecastDays.map((date) => {
		const out = statuses.get(date) ?? new Map();
		const counts = countByStatus(out.values());
		const available = assigned - out.size;
		const offDutyLabel = specialDayNames.get(date) ?? (isWeekend(date) ? 'Weekend' : null);
		const isDutyDay = offDutyLabel === null;
		return {
			date,
			isToday: date === inputs.today,
			isDutyDay,
			offDutyLabel,
			assigned,
			available,
			byStatus: order.flatMap((type) => {
				const count = counts.get(type.id) ?? 0;
				return count > 0 ? [{ statusTypeId: type.id, count }] : [];
			}),
			belowFloor: isDutyDay && isBelowStrengthFloor(available, assigned, inputs.floorPercent)
		};
	});
}

/**
 * The forecast's headline. A run of flagged days is consecutive flagged duty days; a weekend or
 * closure between them neither ends the run nor counts toward it. A flagged day always outranks
 * Steady, and the range and lowest day of the unflagged headlines come from duty days alone.
 */
export function pickForecastHeadline(columns: readonly ForecastColumn[], floorPercent: number): ForecastHeadline {
	const dutyDays = columns.filter((column) => column.isDutyDay);
	const firstFlagged = dutyDays.findIndex((column) => column.belowFloor);

	if (firstFlagged !== -1) {
		const runEnd = dutyDays.findIndex((column, index) => index > firstFlagged && !column.belowFloor);
		const run = dutyDays.slice(firstFlagged, runEnd === -1 ? undefined : runEnd);
		if (run[0].isToday) {
			return { kind: 'underToday', floorPercent, backAbove: runEnd === -1 ? null : dutyDays[runEnd].date };
		}
		return { kind: 'dips', floorPercent, from: run[0].date, days: run.length };
	}

	const basis = dutyDays.length > 0 ? dutyDays : columns;
	const counts = basis.map((column) => column.available);
	const min = Math.min(...counts);
	const max = Math.max(...counts);
	if (max - min <= 1) return { kind: 'steady', min, max };

	const lowest = basis.reduce((low, column) => (column.available < low.available ? column : low));
	return { kind: 'above', min, max, lowest: lowest.date };
}

export function formatForecastHeadline(headline: ForecastHeadline, today: string): string {
	switch (headline.kind) {
		case 'underToday':
			return headline.backAbove
				? `Below ${headline.floorPercent}% today, back above on ${weekdayWithin(headline.backAbove, today)}`
				: `Below ${headline.floorPercent}% today and on every duty day ahead`;
		case 'dips':
			return headline.days === 1
				? `Below ${headline.floorPercent}% on ${longDay(headline.from)}`
				: `Below ${headline.floorPercent}% on ${headline.days} days, from ${longDay(headline.from)}`;
		case 'steady':
			return headline.min === headline.max
				? `Steady: ${headline.min} available every day`
				: `Steady: ${headline.min} to ${headline.max} available every day`;
		case 'above':
			return `${headline.min} to ${headline.max} available, lowest ${headline.lowest === today ? 'today' : longDay(headline.lowest)}`;
	}
}

function buildBottomLine(
	inputs: StrengthInputs,
	statuses: DayStatuses,
	forecast: readonly ForecastColumn[]
): BottomLine {
	const assigned = inputs.personnel.length;
	const outToday = statuses.get(inputs.today) ?? new Map<string, AvailabilityEntry>();
	const available = assigned - outToday.size;
	const percent = availabilityPercent(available, assigned);
	const mode = assigned <= PEOPLE_MODE_LIMIT ? 'people' : 'counts';
	const order = sortedStatusTypes(inputs.statusTypes);
	const statusRank = new Map(order.map((type, index) => [type.id, index]));
	const personById = new Map(inputs.personnel.map((person) => [person.id, person]));
	const groupNameById = new Map(inputs.groups.map((group) => [group.id, group.name]));
	const runs = availabilityRuns(inputs.availability);
	const tomorrowDate = inputs.forecastDays[1];

	const outPeople = [...outToday.values()]
		.map((entry) => {
			const person = personById.get(entry.personnelId)!;
			const back = backDate(runOn(runs.get(entry.personnelId), inputs.today)!);
			return {
				personnelId: person.id,
				name: fullName(person),
				statusTypeId: entry.statusTypeId,
				back,
				backLabel: `back ${back === tomorrowDate ? 'tomorrow' : formatDayMonth(back)}`
			};
		})
		.sort(
			(a, b) =>
				(statusRank.get(a.statusTypeId) ?? 0) - (statusRank.get(b.statusTypeId) ?? 0) || a.name.localeCompare(b.name)
		);

	const outByStatus = order.flatMap((type) => {
		const people = outPeople.filter((row) => row.statusTypeId === type.id);
		if (people.length === 0) return [];
		const origins = countOrigins(
			people.map((row) => personById.get(row.personnelId)!.groupId),
			groupNameById
		);
		const soonest = people.reduce((low, row) => (row.back < low ? row.back : low), people[0].back);
		const returning = people.filter((row) => row.back === soonest).length;
		const when = soonest === tomorrowDate ? 'tomorrow' : formatDayMonth(soonest);
		return [
			{
				statusTypeId: type.id,
				count: people.length,
				originsLabel: origins
					.slice(0, ORIGINS_SHOWN)
					.map(([name, count]) => `${name} ${count}`)
					.join(' · '),
				moreOrigins: Math.max(origins.length - ORIGINS_SHOWN, 0),
				returnLabel: returning === people.length ? `back ${when}` : `${returning} back ${when}`
			}
		];
	});

	const counts = countByStatus(outToday.values());
	return {
		available,
		assigned,
		percent,
		belowFloor: forecast[0]?.belowFloor ?? false,
		mode,
		strip: [
			{ statusTypeId: null, count: available },
			...order.flatMap((type) => {
				const count = counts.get(type.id) ?? 0;
				return count > 0 ? [{ statusTypeId: type.id, count }] : [];
			})
		],
		outPeople,
		outByStatus,
		tomorrow: tomorrowLine(inputs, statuses, runs, forecast, mode)
	};
}

function tomorrowLine(
	inputs: StrengthInputs,
	statuses: DayStatuses,
	runs: ReadonlyMap<string, readonly AvailabilityRun[]>,
	forecast: readonly ForecastColumn[],
	mode: BottomLine['mode']
): string {
	const tomorrow = forecast[1];
	if (!tomorrow) return '';
	const next = statuses.get(tomorrow.date) ?? new Map<string, AvailabilityEntry>();
	const statusById = new Map(inputs.statusTypes.map((type) => [type.id, type]));
	const leaving = inputs.personnel.filter((person) =>
		runs.get(person.id)?.some((run) => run.startDate === tomorrow.date)
	);
	const returning = inputs.personnel.filter((person) =>
		runs.get(person.id)?.some((run) => backDate(run) === tomorrow.date)
	);
	const head = `Tomorrow ${tomorrow.available}.`;

	if (leaving.length === 0 && returning.length === 0) return `${head} No one leaves or returns.`;
	if (mode === 'counts') {
		const parts = [
			leaving.length > 0 ? `${leaving.length} ${leaving.length === 1 ? 'goes' : 'go'} out` : null,
			returning.length > 0 ? `${returning.length} ${returning.length === 1 ? 'returns' : 'return'}` : null
		].filter(Boolean);
		return `${head} ${parts.join(' and ')}.`;
	}

	const starts = leaving
		.map(
			(person) => `${shortName(person)} starts ${statusById.get(next.get(person.id)!.statusTypeId)?.name ?? 'a status'}`
		)
		.join(' and ');
	const returns = returning.map(shortName).join(' and ');
	const sentence = [starts, returns && `${returns} ${returning.length === 1 ? 'returns' : 'return'}`]
		.filter(Boolean)
		.join('; ');
	return `${head} ${sentence}.`;
}

function runOn(runs: readonly AvailabilityRun[] | undefined, day: string): AvailabilityRun | undefined {
	return runs?.find((run) => run.startDate <= day && day <= run.endDate);
}

function buildGroupStrength(inputs: StrengthInputs, outToday: ReadonlyMap<string, AvailabilityEntry>): GroupStrength {
	const tree = buildGroupTree(inputs.groups);
	const strengthRow = (row: GroupRow<Personnel>): GroupStrengthRow => {
		const assigned = row.items.length;
		const available = row.items.filter((person) => !outToday.has(person.id)).length;
		return {
			id: row.key,
			name: row.label,
			level: row.level,
			subtotal: row.subtotal,
			available,
			assigned,
			percent: availabilityPercent(available, assigned),
			belowFloor: isBelowStrengthFloor(available, assigned, inputs.floorPercent)
		};
	};

	const sets = groupRows(tree, inputs.personnel, (person) => person.groupId, inputs.showSubGroups ?? true)
		.map((set) => ({ top: strengthRow(set.top), below: set.below.map(strengthRow) }))
		.sort(
			(a, b) =>
				Number(a.top.id === 'unassigned') - Number(b.top.id === 'unassigned') ||
				a.top.available * b.top.assigned - b.top.available * a.top.assigned ||
				a.top.name.localeCompare(b.top.name)
		);

	return {
		sets,
		shown: sets.length <= GROUPS_SHOWN_LIMIT ? sets.length : GROUPS_FOLDED_TO,
		hasSubGroups: hasSubGroups(tree)
	};
}

function countByStatus(entries: Iterable<AvailabilityEntry>): Map<string, number> {
	const counts = new Map<string, number>();
	for (const entry of entries) counts.set(entry.statusTypeId, (counts.get(entry.statusTypeId) ?? 0) + 1);
	return counts;
}

/** Counts by Group id so Groups sharing a name, or named "Unassigned", stay apart from each other and from ungrouped people. */
function countOrigins(
	groupIds: readonly (string | null)[],
	groupNameById: ReadonlyMap<string, string>
): [string, number][] {
	const counts = new Map<string | null, number>();
	for (const id of groupIds) counts.set(id, (counts.get(id) ?? 0) + 1);
	return [...counts]
		.map(([id, count]): [string, number] => [(id && groupNameById.get(id)) || 'Unassigned', count])
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** 0 is Sunday. Day 0 of the day-number epoch, 1970-01-01, was a Thursday. */
function weekdayOf(date: string): number {
	return (toDayNumber(date) + 4) % 7;
}

/** "T 20": the weekday's initial and the day of the month. */
export function forecastDayLabel(date: string): string {
	return `${WEEKDAYS[weekdayOf(date)][0]} ${dayOfMonth(date)}`;
}

function isWeekend(date: string): boolean {
	const weekday = weekdayOf(date);
	return weekday === 0 || weekday === 6;
}

function dayOfMonth(date: string): number {
	return Number(date.slice(8, 10));
}

function ordinal(day: number): string {
	const tens = day % 100;
	if (tens >= 11 && tens <= 13) return `${day}th`;
	return `${day}${{ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th'}`;
}

/** "Monday 26th". */
export function longDay(date: string): string {
	return `${WEEKDAYS[weekdayOf(date)]} ${ordinal(dayOfMonth(date))}`;
}

/** The weekday alone inside the coming week, else "Thursday 29th". */
function weekdayWithin(date: string, today: string): string {
	return toDayNumber(date) - toDayNumber(today) < 7 ? WEEKDAYS[weekdayOf(date)] : longDay(date);
}

function fullName(person: Personnel): string {
	return `${person.rank} ${person.lastName}, ${person.firstName}`;
}

function shortName(person: Personnel): string {
	return `${person.rank} ${person.lastName}`;
}

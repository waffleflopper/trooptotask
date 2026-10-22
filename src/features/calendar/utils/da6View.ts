import { formatDayMonth, formatDayMonthYear } from '$lib/utils/dates';
import { toDayNumber } from '$lib/utils/dayNumber';
import type {
	Da6Cell,
	Da6Column,
	Da6PassedOver,
	Da6Remark,
	Da6Segment,
	DateKey,
	MonthKey,
	PersonRef,
	RosterCode
} from '../roster/rosterTypes';

export interface Da6Roster {
	readonly id: string;
	readonly name: string;
	readonly shortName: string;
}

/**
 * One form's part of the month with its header dates. `to` is null while the form is open past the month's end.
 * `segment` is null when a closed form's saved record cannot be read.
 */
export interface Da6Sheet {
	readonly formId: string;
	readonly from: DateKey;
	readonly to: DateKey | null;
	readonly segment: Da6Segment | null;
}

export interface Da6View {
	readonly rosters: readonly Da6Roster[];
	readonly roster: Da6Roster;
	readonly month: MonthKey;
	readonly today: DateKey;
	/** Oldest first. Two sheets mean a form closed during the month. */
	readonly sheets: readonly Da6Sheet[];
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** The DA 6 page for one roster. The month defaults to the current one. */
export function da6Href(orgUrlSegment: string, typeId: string, month?: MonthKey): string {
	const path = `/org/${orgUrlSegment}/calendar/rosters/${typeId}`;
	return month ? `${path}?month=${month}` : path;
}

export function parseMonth(value: string | null, today: DateKey): MonthKey {
	return value && MONTH.test(value) ? value : today.slice(0, 7);
}

export function lastDayOf(month: MonthKey): DateKey {
	const [year, value] = month.split('-').map(Number);
	return `${month}-${String(new Date(Date.UTC(year, value, 0)).getUTCDate()).padStart(2, '0')}`;
}

export function monthTitle(month: MonthKey): string {
	return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

export function monthAnchor(month: MonthKey): Date {
	return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
}

export function monthOfAnchor(anchor: Date): MonthKey {
	return `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`;
}

export function weekdayLetter(date: DateKey): string {
	// Day 0 is Thursday 1 Jan 1970.
	return WEEKDAY_LETTERS[(toDayNumber(date) + 4) % 7];
}

export function dayOfMonth(date: DateKey): number {
	return Number(date.slice(8, 10));
}

export function headerDate(date: DateKey): string {
	return formatDayMonthYear(date);
}

export function fullName(person: PersonRef): string {
	return [person.rank, person.lastName].filter(Boolean).join(' ');
}

const CODE_PHRASE: Record<RosterCode, string> = {
	A: 'away',
	D: 'on other duty',
	U: 'unavailable'
};

/** What a screen reader hears after the visible cell text. */
export function cellDescription(cell: Da6Cell): string {
	if (cell === null) return 'Not on the roster';
	if (cell.kind === 'count') return `${cell.count}`;
	if (cell.kind === 'detail') return `${cell.when === 'served' ? 'Pulled duty' : 'Planned duty'} at ${cell.count}`;
	if (cell.kind === 'away') return `A, away (${cell.reason}), count holds at ${cell.count}`;
	return `${cell.code}${cell.count}, ${CODE_PHRASE[cell.code]} (${cell.reason}), count runs`;
}

export function cellLabel(cell: Exclude<Da6Cell, null>): string {
	if (cell.kind === 'away') return 'A';
	if (cell.kind === 'code') return `${cell.code}${cell.count}`;
	return `${cell.count}`;
}

const LEFT_CAUSE = { archived: 'archived', unmatched: 'no longer matches who pulls this duty' } as const;
const JOINED_CAUSE = {
	joined: 'new to the unit',
	matched: 'now matches who pulls this duty',
	reactivated: 'back from the archive'
} as const;

export function remarkText(remark: Da6Remark, sheetFrom: DateKey): string {
	const who = fullName(remark.who);
	switch (remark.kind) {
		case 'excused': {
			const from = remark.from > sheetFrom ? ` from ${formatDayMonth(remark.from)}` : '';
			const through = remark.through ? ` through ${formatDayMonth(remark.through)}` : '';
			return `${who} omitted${from}${through}. Excused: ${remark.reason}.`;
		}
		case 'left':
			return `${who} left the roster ${formatDayMonth(remark.on)}, ${LEFT_CAUSE[remark.cause]}. The row stays for this month.`;
		case 'joined':
			return `${who} joined the roster ${formatDayMonth(remark.on)}, ${JOINED_CAUSE[remark.cause]}, and starts at the foot of the form.`;
		case 'outside':
			return `${who} pulled duty ${formatDayMonth(remark.date)} from outside the roster. It still counts as a detail day for everyone here.`;
	}
}

export interface Da6DayRef {
	readonly sheet: number;
	readonly column: number;
}

/** Today's column, else the last served one, else the first. Null when the month has no column. */
export function defaultDay(sheets: readonly Da6Sheet[], today: DateKey): Da6DayRef | null {
	let fallback: Da6DayRef | null = null;
	for (const [sheet, { segment }] of sheets.entries()) {
		for (const [column, { date }] of (segment?.columns ?? []).entries()) {
			if (date === today) return { sheet, column };
			if (date < today || fallback === null) fallback = { sheet, column };
		}
	}
	return fallback;
}

function list(items: readonly string[]): string {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function because(person: Da6PassedOver): string {
	return `${person.lastName} is ${CODE_PHRASE[person.code]} (${person.reason})`;
}

/** The plain-language pick for one column, as the Show the work strip reads it. */
export function workedExample(segment: Da6Segment, index: number): string {
	const column: Da6Column = segment.columns[index];
	const { pick, passedOver, rulePick } = column;
	const row = segment.rows.findIndex((person) => person.personId === pick.personId);
	const pickCell = segment.cells[row]?.[index];
	const count = pickCell ? pickCell.count : null;
	const at = count === null ? '' : ` at ${count}`;

	if (rulePick) {
		return `Assigned by hand to ${fullName(pick)}${at}. By the rule it would have gone to ${fullName(rulePick)}. A hand-assigned day still counts, so ${pick.lastName} starts over.`;
	}
	if (passedOver.length) {
		const sitting = passedOver.every((person) => person.count === count)
			? `${list([...passedOver, pick].map(fullName))} ${passedOver.length === 1 ? 'both' : 'all'} sit at ${count}.`
			: `${list(passedOver.map((person) => `${fullName(person)} sits at ${person.count}`))}, ahead of ${fullName(pick)}${at}.`;
		const after = passedOver.map((person) => {
			if (person.code !== 'A') return `${person.lastName}'s count keeps running.`;
			const next = segment.columns.findIndex(
				(candidate, later) => later > index && candidate.pick.personId === person.personId
			);
			return next < 0
				? `${person.lastName} holds at ${person.count}.`
				: `${person.lastName} holds at ${person.count} and goes first after returning, on ${formatDayMonth(segment.columns[next].date)}.`;
		});
		return [sitting, `${list(passedOver.map(because))}, so ${pick.lastName} pulls it.`, ...after].join(' ');
	}
	const tied = segment.rows.filter(
		(person, rowIndex) =>
			person.personId !== pick.personId &&
			segment.cells[rowIndex][index]?.kind === 'count' &&
			segment.cells[rowIndex][index]?.count === count
	);
	const highest = `${fullName(pick)} has the highest number${at}, so ${pick.lastName} pulls it.`;
	if (!tied.length) return highest;
	const names = [pick, ...tied];
	const sitting =
		names.length > 3 ? `All ${names.length}` : `${list(names.map(fullName))} ${names.length === 2 ? 'both' : 'all'}`;
	return `${sitting} sit${at}. ${pick.lastName} is higher on the form, so ${pick.lastName} pulls it.`;
}

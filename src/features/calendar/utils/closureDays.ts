import type { SpecialDay } from '$features/calendar/contracts';

/** The most days one closure request may create; the server enforces the same bound. */
export const MAX_CLOSURE_DAYS = 366;

export interface ClosureDraft {
	startDate: string;
	endDate: string;
	skipWeekends: boolean;
}

export type ClosureDates = { ok: true; dates: string[] } | { ok: false; reason: 'end-before-start' | 'too-many-days' };

const DAY_MS = 86_400_000;

// UTC midnights keep every step one calendar day, whatever the viewer's daylight-saving rules.
const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromUtc = (time: number) => new Date(time).toISOString().slice(0, 10);
const isWeekendUtc = (time: number) => {
	const weekday = new Date(time).getUTCDay();
	return weekday === 0 || weekday === 6;
};

export function closureDates({ startDate, endDate, skipWeekends }: ClosureDraft): ClosureDates {
	const start = toUtc(startDate);
	const end = toUtc(endDate);
	if (end < start) return { ok: false, reason: 'end-before-start' };
	const dates: string[] = [];
	for (let time = start; time <= end; time += DAY_MS) {
		if (skipWeekends && isWeekendUtc(time)) continue;
		if (dates.length === MAX_CLOSURE_DAYS) return { ok: false, reason: 'too-many-days' };
		dates.push(fromUtc(time));
	}
	return { ok: true, dates };
}

/** Splits the draft's dates into those to create and those that already have a holiday or closure. */
export function partitionClosureDates(
	dates: readonly string[],
	existing: readonly Pick<SpecialDay, 'date'>[]
): { create: string[]; skip: string[] } {
	const taken = new Set(existing.map((day) => day.date));
	return { create: dates.filter((date) => !taken.has(date)), skip: dates.filter((date) => taken.has(date)) };
}

export type ClosureListRow =
	| { kind: 'day'; day: SpecialDay }
	/** Two or more closure days with one name, separated only by weekends. */
	| { kind: 'range'; name: string; days: SpecialDay[] };

export interface ClosureListMonth {
	/** 0 for January. */
	month: number;
	rows: ClosureListRow[];
}

export interface ClosureListView {
	/** Months wholly before the viewer's current month, collapsed behind one disclosure. */
	past: { throughMonth: number; dayCount: number; months: ClosureListMonth[] } | null;
	months: ClosureListMonth[];
}

const monthOf = (date: string) => Number(date.slice(5, 7)) - 1;

function onlyWeekendsBetween(earlier: string, later: string): boolean {
	const end = toUtc(later);
	for (let time = toUtc(earlier) + DAY_MS; time < end; time += DAY_MS) {
		if (!isWeekendUtc(time)) return false;
	}
	return true;
}

/**
 * Groups one year's Special Days into month rows. `today` is the viewer's local date; a past year
 * collapses entirely and a future year collapses nothing.
 */
export function closureListView(days: readonly SpecialDay[], year: number, today: string): ClosureListView {
	const sorted = [...days].sort(
		(a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
	);
	const rows: SpecialDay[][] = [];
	const openRangeByName = new Map<string, SpecialDay[]>();
	for (const day of sorted) {
		if (day.type === 'org-closure') {
			const open = openRangeByName.get(day.name);
			const last = open?.at(-1);
			if (open && last && last.date < day.date && onlyWeekendsBetween(last.date, day.date)) {
				open.push(day);
				continue;
			}
		}
		const row = [day];
		rows.push(row);
		if (day.type === 'org-closure') openRangeByName.set(day.name, row);
	}

	const months: ClosureListMonth[] = [];
	for (const members of rows) {
		const month = monthOf(members[0].date);
		const row: ClosureListRow =
			members.length === 1 ? { kind: 'day', day: members[0] } : { kind: 'range', name: members[0].name, days: members };
		const group = months.at(-1);
		if (group?.month === month) group.rows.push(row);
		else months.push({ month, rows: [row] });
	}

	const todayYear = Number(today.slice(0, 4));
	const firstOpenMonth = year < todayYear ? 12 : year > todayYear ? 0 : monthOf(today);
	const pastMonths = months.filter((group) => group.month < firstOpenMonth);
	if (pastMonths.length === 0) return { past: null, months };
	return {
		past: {
			throughMonth: firstOpenMonth - 1,
			dayCount: pastMonths.reduce(
				(count, group) => count + group.rows.reduce((sum, row) => sum + (row.kind === 'day' ? 1 : row.days.length), 0),
				0
			),
			months: pastMonths
		},
		months: months.filter((group) => group.month >= firstOpenMonth)
	};
}

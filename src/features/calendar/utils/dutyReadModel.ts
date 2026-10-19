import type { AssignmentType, AvailabilityEntry, DailyAssignment } from '$features/calendar/contracts';
import { assignmentSlotKey } from './calendarIndexes';
import type { CalendarBufferedRange } from './calendarRange';
import { DUTY_LOOKBACK_DAYS } from './calendarRange';
import { fromDayNumber, toDayNumber, type DayNumber, type DayWindow } from '$lib/utils/dayNumber';

/** Duty days per assignment type and assignee, ascending and without repeats. */
export type DutyHistoryIndex = ReadonlyMap<string, ReadonlyMap<string, readonly DayNumber[]>>;

export type DutyAvailabilityIndex = ReadonlyMap<string, readonly AvailabilityEntry[]>;

export type LastDuty =
	| { readonly kind: 'none' }
	| { readonly kind: 'previous'; readonly date: string; readonly daysSince: number };

export interface DutyConflict {
	readonly assignment: DailyAssignment;
	/** Every availability entry that covers the assignment's date. */
	readonly entries: readonly [AvailabilityEntry, ...AvailabilityEntry[]];
}

export interface DutyConflicts {
	readonly items: readonly DutyConflict[];
	readonly bySlot: ReadonlyMap<string, DutyConflict>;
}

export function indexDutyHistory(assignments: readonly DailyAssignment[]): DutyHistoryIndex {
	const days = new Map<string, Map<string, Set<DayNumber>>>();
	for (const assignment of assignments) {
		const byAssignee = days.get(assignment.assignmentTypeId) ?? new Map<string, Set<DayNumber>>();
		const assigneeDays = byAssignee.get(assignment.assigneeId) ?? new Set<DayNumber>();
		assigneeDays.add(toDayNumber(assignment.date));
		byAssignee.set(assignment.assigneeId, assigneeDays);
		days.set(assignment.assignmentTypeId, byAssignee);
	}
	return new Map(
		[...days].map(([typeId, byAssignee]) => [
			typeId,
			new Map([...byAssignee].map(([assigneeId, set]) => [assigneeId, [...set].sort((a, b) => a - b)]))
		])
	);
}

/** The latest duty strictly before `dateKey` and no more than `DUTY_LOOKBACK_DAYS` days earlier. */
export function lastDutyBefore(input: {
	history: DutyHistoryIndex;
	assignmentTypeId: string;
	personnelId: string;
	dateKey: string;
}): LastDuty {
	const days = input.history.get(input.assignmentTypeId)?.get(input.personnelId);
	if (!days) return { kind: 'none' };
	const target = toDayNumber(input.dateKey);
	const previous = days[lowerBound(days, target) - 1];
	if (previous === undefined || target - previous > DUTY_LOOKBACK_DAYS) return { kind: 'none' };
	return { kind: 'previous', date: fromDayNumber(previous), daysSince: target - previous };
}

export interface DutyTally {
	readonly count: number;
	readonly latestDay: DayNumber | null;
}

export function dutyTallyInWindow(input: {
	history: DutyHistoryIndex;
	assignmentTypeId: string;
	assigneeId: string;
	window: DayWindow;
}): DutyTally {
	const days = input.history.get(input.assignmentTypeId)?.get(input.assigneeId);
	if (!days) return { count: 0, latestDay: null };
	const from = lowerBound(days, input.window.start);
	const to = lowerBound(days, input.window.start + input.window.days);
	return { count: to - from, latestDay: to > from ? days[to - 1] : null };
}

function lowerBound(days: readonly DayNumber[], target: number): number {
	let low = 0;
	let high = days.length;
	while (low < high) {
		const middle = (low + high) >> 1;
		if (days[middle] < target) low = middle + 1;
		else high = middle;
	}
	return low;
}

export function indexDutyAvailability(entries: readonly AvailabilityEntry[]): DutyAvailabilityIndex {
	const byPerson = new Map<string, AvailabilityEntry[]>();
	for (const entry of entries) {
		const personEntries = byPerson.get(entry.personnelId);
		if (personEntries) personEntries.push(entry);
		else byPerson.set(entry.personnelId, [entry]);
	}
	return byPerson;
}

/**
 * Person assignments inside `range` whose date an availability entry covers, one pass for both
 * the date-ordered list and the slot lookup. Ties on date follow the order of `assignmentTypes`.
 */
export function findDutyConflicts(input: {
	assignments: readonly DailyAssignment[];
	assignmentTypes: readonly AssignmentType[];
	availabilityByPerson: DutyAvailabilityIndex;
	range: CalendarBufferedRange;
}): DutyConflicts {
	const typeOrder = new Map<string, number>();
	for (const type of input.assignmentTypes) {
		if (type.assignTo === 'personnel' && !type.archivedAt) typeOrder.set(type.id, typeOrder.size);
	}

	const items: DutyConflict[] = [];
	const bySlot = new Map<string, DutyConflict>();
	for (const assignment of input.assignments) {
		if (!typeOrder.has(assignment.assignmentTypeId)) continue;
		if (assignment.date < input.range.rangeStart || assignment.date > input.range.rangeEnd) continue;
		const slot = assignmentSlotKey(assignment.date, assignment.assignmentTypeId);
		if (bySlot.has(slot)) continue;
		const covering = input.availabilityByPerson
			.get(assignment.assigneeId)
			?.filter((entry) => entry.startDate <= assignment.date && entry.endDate >= assignment.date);
		if (!covering?.length) continue;
		const conflict: DutyConflict = { assignment, entries: covering as [AvailabilityEntry, ...AvailabilityEntry[]] };
		items.push(conflict);
		bySlot.set(slot, conflict);
	}

	items.sort(
		(a, b) =>
			compareText(a.assignment.date, b.assignment.date) ||
			typeOrder.get(a.assignment.assignmentTypeId)! - typeOrder.get(b.assignment.assignmentTypeId)! ||
			compareText(a.assignment.id, b.assignment.id)
	);
	return { items, bySlot };
}

function compareText(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

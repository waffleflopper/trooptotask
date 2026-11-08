import type { AssignmentType, AvailabilityEntry, DailyAssignment, StatusType } from '$features/calendar/contracts';
import { availabilityEntryLabel } from './availabilityLabels';
import { assignmentSlotKey } from './calendarIndexes';
import type { CalendarBufferedRange } from './calendarRange';

export type DutyAvailabilityIndex = ReadonlyMap<string, readonly AvailabilityEntry[]>;

export interface DutyConflict {
	readonly assignment: DailyAssignment;
	/** Every availability entry that covers the assignment's date. */
	readonly entries: readonly [AvailabilityEntry, ...AvailabilityEntry[]];
}

export interface DutyConflicts {
	readonly items: readonly DutyConflict[];
	readonly bySlot: ReadonlyMap<string, DutyConflict>;
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

/** The entries that take a person off duty: every status except the ones that leave them available. */
export function blockingAvailability(
	entries: readonly AvailabilityEntry[],
	statusTypes: readonly StatusType[]
): AvailabilityEntry[] {
	const stillAvailable = new Set(
		statusTypes.filter((status) => status.rosterEffect === 'available').map((status) => status.id)
	);
	return entries.filter((entry) => !stillAvailable.has(entry.statusTypeId));
}

/** Why a person is unavailable on `dateKey`, such as "Leave 20–23 Oct; TDY 21–25 Oct", or undefined when nothing covers it. */
export function coveringLabel(
	entries: readonly AvailabilityEntry[] | undefined,
	dateKey: string,
	statusName: ReadonlyMap<string, string>,
	ignoring?: ReadonlySet<string>
): string | undefined {
	const labels = entries
		?.filter((entry) => entry.startDate <= dateKey && entry.endDate >= dateKey && !ignoring?.has(entry.statusTypeId))
		.map((entry) => availabilityEntryLabel(entry, statusName));
	return labels?.length ? labels.join('; ') : undefined;
}

/** The label of each conflict by slot, for a surface that shows why an assigned day is unavailable. */
export function dutyConflictReasons(
	conflicts: DutyConflicts,
	statusTypes: readonly StatusType[]
): ReadonlyMap<string, string> {
	const statusName = new Map(statusTypes.map((status) => [status.id, status.name]));
	return new Map(
		[...conflicts.bySlot].map(([slot, conflict]) => [
			slot,
			conflict.entries.map((entry) => availabilityEntryLabel(entry, statusName)).join('; ')
		])
	);
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

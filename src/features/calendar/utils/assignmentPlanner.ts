import type { AssignmentType, DailyAssignment, SpecialDay, StatusType } from '$features/calendar/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import { formatDate, getMonthDates, isWeekend, parseDate } from '$lib/utils/dates';
import { availabilityEntryLabel } from './availabilityLabels';
import { assignmentSlotKey } from './calendarIndexes';
import type { DutyConflicts } from './dutyReadModel';
import { effectLabel, type RosterView } from './plannerRosters';

export type QuickFillDays = 'weekdays' | 'weekends' | 'all';

/** One slot written by Quick fill or Clear month; an empty `assigneeId` clears the slot. */
export interface AssignmentWrite {
	date: string;
	assignmentTypeId: string;
	assigneeId: string;
}

export interface PlannerAssignee {
	readonly id: string;
	/** Rank for a person, nothing for a Group. */
	readonly prefix: string | null;
	readonly name: string;
	readonly fullName: string;
}

export interface PlannerConflict {
	readonly typeId: string;
	readonly typeName: string;
	readonly dateKey: string;
	readonly dateLabel: string;
	readonly assignee: PlannerAssignee;
	/** The roster code and reason, such as "CQ (D)", or every covering entry, such as "Leave 20–23 Oct; TDY 21–25 Oct". */
	readonly reason: string;
}

export interface PlannerCell {
	readonly typeId: string;
	readonly dateKey: string;
	readonly assignee: PlannerAssignee | null;
	readonly conflict: PlannerConflict | null;
}

export interface PlannerColumn {
	readonly type: AssignmentType;
	readonly filledDays: number;
	readonly totalDays: number;
}

export interface PlannerRow {
	readonly dateKey: string;
	readonly dateLabel: string;
	readonly day: number;
	readonly weekday: string;
	readonly weekend: boolean;
	readonly today: boolean;
	readonly past: boolean;
	readonly specialDayName: string | null;
	readonly cells: readonly PlannerCell[];
}

export interface PlannerTable {
	readonly columns: readonly PlannerColumn[];
	readonly rows: readonly PlannerRow[];
	readonly conflicts: readonly PlannerConflict[];
}

const DATE_LABEL = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

/** The month `anchor` falls in, one row per date and one cell per column, ready to render. */
export function buildPlannerTable(input: {
	anchor: Date;
	todayKey: string;
	columns: readonly AssignmentType[];
	assignmentsBySlot: ReadonlyMap<string, DailyAssignment>;
	conflicts: DutyConflicts;
	/** Rosters by type. On the days a roster details, its A, D and U conflicts replace the availability check. */
	rosters?: ReadonlyMap<string, Pick<RosterView, 'covered' | 'conflicts'>>;
	personnel: readonly Personnel[];
	groups: readonly Group[];
	specialDays: readonly SpecialDay[];
	statusTypes: readonly StatusType[];
}): PlannerTable {
	const personById = new Map(input.personnel.map((person) => [person.id, person]));
	const groupById = new Map(input.groups.map((group) => [group.id, group]));
	const statusName = new Map(input.statusTypes.map((status) => [status.id, status.name]));
	const typeById = new Map(input.columns.map((type) => [type.id, type]));

	const specialDayNames = new Map<string, string[]>();
	for (const day of input.specialDays) {
		specialDayNames.set(day.date, [...(specialDayNames.get(day.date) ?? []), day.name]);
	}

	function assigneeFor(type: AssignmentType, assigneeId: string): PlannerAssignee {
		if (type.assignTo === 'group') {
			const name = groupById.get(assigneeId)?.name ?? 'Missing group';
			return { id: assigneeId, prefix: null, name, fullName: name };
		}
		const person = personById.get(assigneeId);
		if (!person)
			return { id: assigneeId, prefix: null, name: 'Outside roster', fullName: 'Someone outside your roster' };
		return {
			id: assigneeId,
			prefix: person.rank,
			name: person.lastName,
			fullName: `${person.rank} ${person.lastName}, ${person.firstName}`
		};
	}

	function presentConflict(type: AssignmentType, date: string, assigneeId: string, reason: string): PlannerConflict {
		return {
			typeId: type.id,
			typeName: type.name,
			dateKey: date,
			dateLabel: DATE_LABEL.format(parseDate(date)),
			assignee: assigneeFor(type, assigneeId),
			reason
		};
	}

	const rosters = input.rosters ?? new Map<string, Pick<RosterView, 'covered' | 'conflicts'>>();
	const conflicts: PlannerConflict[] = [];
	for (const item of input.conflicts.items) {
		const type = typeById.get(item.assignment.assignmentTypeId);
		const { date, assigneeId } = item.assignment;
		if (!type || rosters.get(type.id)?.covered.has(date)) continue;
		const reason = item.entries.map((entry) => availabilityEntryLabel(entry, statusName)).join('; ');
		conflicts.push(presentConflict(type, date, assigneeId, reason));
	}
	for (const [typeId, roster] of rosters) {
		const type = typeById.get(typeId);
		if (!type) continue;
		for (const item of roster.conflicts) {
			// A count read can trail a write, so only a conflict on the slot's current assignee shows.
			if (input.assignmentsBySlot.get(assignmentSlotKey(item.date, typeId))?.assigneeId !== item.personId) continue;
			conflicts.push(presentConflict(type, item.date, item.personId, effectLabel(item)));
		}
	}
	// A roster only sees the days it covers, so name a person holding two duties on any other day here.
	const monthKeys = new Set(getMonthDates(input.anchor.getFullYear(), input.anchor.getMonth()).map(formatDate));
	const dutiesByPersonDay = new Map<string, DailyAssignment[]>();
	for (const assignment of input.assignmentsBySlot.values()) {
		if (typeById.get(assignment.assignmentTypeId)?.assignTo !== 'personnel' || !monthKeys.has(assignment.date))
			continue;
		const key = `${assignment.date}|${assignment.assigneeId}`;
		dutiesByPersonDay.set(key, [...(dutiesByPersonDay.get(key) ?? []), assignment]);
	}
	for (const duties of dutiesByPersonDay.values()) {
		for (const duty of duties) {
			const others = duties
				.filter((other) => other !== duty)
				.map((other) => `${typeById.get(other.assignmentTypeId)!.name} (D)`);
			if (!others.length || rosters.get(duty.assignmentTypeId)?.covered.has(duty.date)) continue;
			const type = typeById.get(duty.assignmentTypeId)!;
			const at = conflicts.findIndex((conflict) => conflict.typeId === type.id && conflict.dateKey === duty.date);
			if (at < 0) conflicts.push(presentConflict(type, duty.date, duty.assigneeId, others.join('; ')));
			else conflicts[at] = { ...conflicts[at], reason: [conflicts[at].reason, ...others].join('; ') };
		}
	}
	const columnOrder = new Map(input.columns.map((type, index) => [type.id, index]));
	conflicts.sort(
		(a, b) => a.dateKey.localeCompare(b.dateKey) || (columnOrder.get(a.typeId) ?? 0) - (columnOrder.get(b.typeId) ?? 0)
	);
	const conflictBySlot = new Map(
		conflicts.map((conflict) => [assignmentSlotKey(conflict.dateKey, conflict.typeId), conflict])
	);

	const filled = new Map(input.columns.map((type) => [type.id, 0]));
	const dates = getMonthDates(input.anchor.getFullYear(), input.anchor.getMonth());
	const rows = dates.map((date): PlannerRow => {
		const dateKey = formatDate(date);
		const cells = input.columns.map((type): PlannerCell => {
			const slot = assignmentSlotKey(dateKey, type.id);
			const assignment = input.assignmentsBySlot.get(slot);
			if (assignment) filled.set(type.id, (filled.get(type.id) ?? 0) + 1);
			return {
				typeId: type.id,
				dateKey,
				assignee: assignment ? assigneeFor(type, assignment.assigneeId) : null,
				conflict: conflictBySlot.get(slot) ?? null
			};
		});
		return {
			dateKey,
			dateLabel: DATE_LABEL.format(date),
			day: date.getDate(),
			weekday: WEEKDAY.format(date),
			weekend: isWeekend(date),
			today: dateKey === input.todayKey,
			past: dateKey < input.todayKey,
			specialDayName: specialDayNames.get(dateKey)?.join(' / ') ?? null,
			cells
		};
	});

	return {
		columns: input.columns.map((type) => ({ type, filledDays: filled.get(type.id) ?? 0, totalDays: dates.length })),
		rows,
		conflicts
	};
}

/**
 * The slots Quick fill writes for one duty type in the month `anchor` falls in. With `onlyOpenDays`,
 * slots of this type that already have someone are left alone; without it they are overwritten.
 */
export function buildQuickFillBatch(input: {
	anchor: Date;
	typeId: string;
	assigneeId: string;
	days: QuickFillDays;
	onlyOpenDays: boolean;
	assignmentsBySlot: ReadonlyMap<string, DailyAssignment>;
}): AssignmentWrite[] {
	return getMonthDates(input.anchor.getFullYear(), input.anchor.getMonth())
		.filter((date) => {
			const weekend = isWeekend(date);
			return input.days === 'all' || (input.days === 'weekends' ? weekend : !weekend);
		})
		.map(formatDate)
		.filter((dateKey) => !input.onlyOpenDays || !input.assignmentsBySlot.has(assignmentSlotKey(dateKey, input.typeId)))
		.map((dateKey) => ({ date: dateKey, assignmentTypeId: input.typeId, assigneeId: input.assigneeId }));
}

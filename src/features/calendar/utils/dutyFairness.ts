import type { AssignmentType, StatusType } from '$features/calendar/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import { parseDate } from '$lib/utils/dates';
import { availabilityEntryLabel } from './availabilityLabels';
import { DUTY_LOOKBACK_DAYS, type CalendarBufferedRange } from './calendarRange';
import { dayWindow, fromDayNumber, toDayNumber, type DayNumber, type DayWindow } from './dayNumber';
import { eligibleAssignees, type AssigneeChoice } from './dutyPickerOptions';
import { dutyTallyInWindow, type DutyAvailabilityIndex, type DutyHistoryIndex } from './dutyReadModel';
import { oneDayLabel } from './oneDayLabel';

export const METER_CELLS = 4;

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

interface DutyFairnessTally {
	readonly count: number;
	/** Filled cells out of METER_CELLS, scaled to the busiest row once counts pass METER_CELLS. */
	readonly meter: number;
	readonly lastDuty: {
		readonly date: string;
		readonly dateLabel: string;
		/** "Today", "41d" or, for a planned duty, "in 3d". */
		readonly relative: string;
	} | null;
}

export type DutyFairnessRow =
	| (Extract<AssigneeChoice, { kind: 'group' }> & DutyFairnessTally)
	| (Extract<AssigneeChoice, { kind: 'personnel' }> &
			DutyFairnessTally & {
				readonly name: string;
				readonly unavailable?: { readonly code: string; readonly label: string };
			});

export interface DutyFairness {
	readonly type: AssignmentType;
	readonly window: { readonly start: string; readonly end: string; readonly label: string };
	readonly rows: readonly DutyFairnessRow[];
	readonly exemptNote: string | null;
}

export interface DutyFairnessInput {
	type: AssignmentType;
	month: CalendarBufferedRange;
	todayKey: string;
	personnel: readonly Personnel[];
	groups: readonly Group[];
	history: DutyHistoryIndex;
	availabilityByPerson: DutyAvailabilityIndex;
	statusTypes: readonly StatusType[];
}

export function dutyFairness(input: DutyFairnessInput): DutyFairness {
	const { type, month } = input;
	const window = lookbackEndingOn(month.rangeEnd);
	const start = fromDayNumber(window.start);
	const plannableStart = input.todayKey > month.rangeStart ? input.todayKey : month.rangeStart;
	const statusById = new Map(input.statusTypes.map((status) => [status.id, status]));
	const statusName = new Map(input.statusTypes.map((status) => [status.id, status.name]));
	const lastNames = new Map(input.personnel.map((person) => [person.id, person.lastName]));

	const assignees = eligibleAssignees(type, input.personnel, input.groups);
	const nameOrder = new Map(assignees.map((assignee, index) => [assignee.id, index]));
	const tallies = assignees.map((assignee) =>
		dutyTallyInWindow({ history: input.history, assignmentTypeId: type.id, assigneeId: assignee.id, window })
	);
	const busiest = Math.max(0, ...tallies.map((tally) => tally.count));
	const rows = assignees.map((assignee, index): DutyFairnessRow => {
		const { count, latestDay } = tallies[index];
		const tally = {
			count,
			meter: busiest <= METER_CELLS ? count : Math.ceil((count * METER_CELLS) / busiest),
			lastDuty: latestDay === null ? null : lastDutyOn(latestDay, input.todayKey)
		};
		if (assignee.kind === 'group') return { ...assignee, ...tally };
		const entries = plannableStart <= month.rangeEnd ? input.availabilityByPerson.get(assignee.id) : undefined;
		const overlapping = entries?.filter(
			(entry) => entry.startDate <= month.rangeEnd && entry.endDate >= plannableStart
		);
		return {
			...assignee,
			...tally,
			name: lastNames.get(assignee.id)!,
			unavailable: overlapping?.length
				? {
						code: oneDayLabel(statusById.get(overlapping[0].statusTypeId) ?? { name: 'Unavailable', shortLabel: null }),
						label: overlapping.map((entry) => availabilityEntryLabel(entry, statusName)).join('; ')
					}
				: undefined
		};
	});

	rows.sort(
		(a, b) =>
			compareLastDuty(a.lastDuty?.date, b.lastDuty?.date) ||
			a.count - b.count ||
			nameOrder.get(a.id)! - nameOrder.get(b.id)!
	);

	return {
		type,
		window: {
			start,
			end: month.rangeEnd,
			label: `${DAY_MONTH.format(parseDate(start))} – ${DAY_MONTH.format(parseDate(month.rangeEnd))}`
		},
		rows,
		exemptNote: exemptNote(type, input.personnel)
	};
}

function lastDutyOn(day: DayNumber, todayKey: string): NonNullable<DutyFairnessTally['lastDuty']> {
	const date = fromDayNumber(day);
	return { date, dateLabel: DAY_MONTH.format(parseDate(date)), relative: relativeDay(toDayNumber(todayKey) - day) };
}

function relativeDay(daysAgo: number): string {
	if (daysAgo === 0) return 'Today';
	return daysAgo > 0 ? `${daysAgo}d` : `in ${-daysAgo}d`;
}

function exemptNote(type: AssignmentType, personnel: readonly Personnel[]): string | null {
	if (type.assignTo === 'group') return null;
	const exempt = new Set(type.exemptPersonnelIds);
	const names = personnel
		.filter((person) => exempt.has(person.id))
		.map((person) => `${person.rank} ${person.lastName}`);
	if (names.length === 0) return null;
	return `${new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(names)} ${names.length === 1 ? 'is' : 'are'} exempt.`;
}

function lookbackEndingOn(dateKey: string): DayWindow {
	return dayWindow(fromDayNumber(toDayNumber(dateKey) - DUTY_LOOKBACK_DAYS + 1), DUTY_LOOKBACK_DAYS);
}

function compareLastDuty(a: string | undefined, b: string | undefined): number {
	if (a === b) return 0;
	if (a === undefined) return -1;
	if (b === undefined) return 1;
	return a < b ? -1 : 1;
}

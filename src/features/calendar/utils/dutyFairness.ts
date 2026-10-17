import type { AssignmentType, StatusType } from '$features/calendar/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import { parseDate } from '$lib/utils/dates';
import { availabilityEntryLabel } from './availabilityLabels';
import { DUTY_LOOKBACK_DAYS, type CalendarBufferedRange } from './calendarRange';
import { dayWindow, fromDayNumber, toDayNumber, type DayWindow } from './dayNumber';
import { eligibleAssignees, type AssigneeChoice } from './dutyPickerOptions';
import { dutyTallyInWindow, type DutyAvailabilityIndex, type DutyHistoryIndex } from './dutyReadModel';

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

interface DutyFairnessTally {
	readonly count: number;
	readonly lastDuty: { readonly date: string; readonly label: string } | null;
}

export type DutyFairnessRow =
	| (Extract<AssigneeChoice, { kind: 'group' }> & DutyFairnessTally)
	| (Extract<AssigneeChoice, { kind: 'personnel' }> & DutyFairnessTally & { readonly unavailable?: string });

export interface DutyFairness {
	readonly type: AssignmentType;
	readonly window: { readonly start: string; readonly end: string; readonly label: string };
	readonly rows: readonly DutyFairnessRow[];
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
	const statusName = new Map(input.statusTypes.map((status) => [status.id, status.name]));

	const assignees = eligibleAssignees(type, input.personnel, input.groups);
	const nameOrder = new Map(assignees.map((assignee, index) => [assignee.id, index]));
	const rows = assignees.map((assignee): DutyFairnessRow => {
		const { count, latestDay } = dutyTallyInWindow({
			history: input.history,
			assignmentTypeId: type.id,
			assigneeId: assignee.id,
			window
		});
		const lastDate = latestDay === null ? null : fromDayNumber(latestDay);
		const tally = {
			count,
			lastDuty: lastDate === null ? null : { date: lastDate, label: DAY_MONTH.format(parseDate(lastDate)) }
		};
		if (assignee.kind === 'group') return { ...assignee, ...tally };
		const entries = plannableStart <= month.rangeEnd ? input.availabilityByPerson.get(assignee.id) : undefined;
		const overlapping = entries
			?.filter((entry) => entry.startDate <= month.rangeEnd && entry.endDate >= plannableStart)
			.map((entry) => availabilityEntryLabel(entry, statusName));
		return { ...assignee, ...tally, unavailable: overlapping?.length ? overlapping.join('; ') : undefined };
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
		rows
	};
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

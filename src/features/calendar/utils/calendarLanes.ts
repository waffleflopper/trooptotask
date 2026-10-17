import type { Component } from 'svelte';
import type { AssignmentType, DailyAssignment, SpecialDay } from '$features/calendar/contracts';
import type { Group, Personnel } from '$features/personnel/contracts';
import AssignmentLaneCell, {
	type AssignmentLaneDay
} from '$features/calendar/components/calendar-lanes/AssignmentLaneCell.svelte';
import DaysLaneSegmentView, {
	type DaysLaneSegment
} from '$features/calendar/components/calendar-lanes/DaysLaneSegment.svelte';
import { CALENDAR_DATE_LABEL } from '$features/calendar/utils/calendarRenderState';
import { formatDate } from '$lib/utils/dates';

function bySortOrder(a: AssignmentType, b: AssignmentType): number {
	return a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function calendarLaneTypes(types: readonly AssignmentType[]): AssignmentType[] {
	return types.filter((type) => type.showOnCalendar && !type.archivedAt).sort(bySortOrder);
}

/** The Duty planner's columns: the Calendar's lane types in lane order, then the planner-only types. */
export function plannerColumns(types: readonly AssignmentType[]): AssignmentType[] {
	return [
		...calendarLaneTypes(types),
		...types.filter((type) => !type.showOnCalendar && !type.archivedAt).sort(bySortOrder)
	];
}

export function calendarLaneIds(types: readonly AssignmentType[]): string[] {
	return calendarLaneTypes(types).map((type) => type.id);
}

export function movedTo(ids: readonly string[], id: string, toIndex: number): string[] {
	const rest = ids.filter((candidate) => candidate !== id);
	if (rest.length === ids.length) return [...ids];
	rest.splice(Math.max(0, Math.min(toIndex, rest.length)), 0, id);
	return rest;
}

export interface CalendarLane {
	readonly key: string;
	readonly kind: string;
	readonly label: string;
	readonly color?: string;
	readonly detail?: string;
	readonly summary: string;
	readonly track: LaneTrack;
}

export type LaneTrack =
	| { readonly shape: 'day'; readonly Day: Component<{ value: unknown }>; readonly days: readonly unknown[] }
	| {
			readonly shape: 'span';
			readonly Segment: Component<{ value: unknown }>;
			readonly segments: readonly LaneSegment<unknown>[];
	  };

/** `start` and `end` are inclusive indexes into the visible dates. */
export interface LaneSegment<T> {
	readonly start: number;
	readonly end: number;
	readonly value: T;
}

// The only place a kind's value type meets its renderer. Layout hands each value back to that renderer.
export function dayTrack<T>(Day: Component<{ value: T }>, days: readonly T[]): LaneTrack {
	return { shape: 'day', Day: Day as Component<{ value: unknown }>, days };
}

export function spanTrack<T>(Segment: Component<{ value: T }>, segments: readonly LaneSegment<T>[]): LaneTrack {
	return { shape: 'span', Segment: Segment as Component<{ value: unknown }>, segments };
}

export type { AssignmentLaneDay, DaysLaneSegment };

export interface CalendarLaneActions {
	/** Absent while an open day cannot offer a picker, so it renders no button. */
	openDay?: (typeId: string, date: Date, anchor: HTMLElement) => void;
	editDay(date: Date): void;
}

export interface CalendarLaneInput {
	dates: readonly Date[];
	assignmentTypes: readonly AssignmentType[];
	assignments: readonly DailyAssignment[];
	specialDays: readonly SpecialDay[];
	personnel: readonly Personnel[];
	groups: readonly Group[];
	actions?: CalendarLaneActions;
}

const SPECIAL_DAY_KIND: Record<SpecialDay['type'], string> = {
	'federal-holiday': 'federal holiday',
	'org-closure': 'closure'
};

const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });

export function buildCalendarLanes(input: CalendarLaneInput): CalendarLane[] {
	const dateKeys = input.dates.map(formatDate);
	const dateLabels = input.dates.map((date) => CALENDAR_DATE_LABEL.format(date));
	const assigneeByDayType = new Map(
		input.assignments.map((assignment) => [`${assignment.date}|${assignment.assignmentTypeId}`, assignment.assigneeId])
	);
	const personById = new Map(input.personnel.map((person) => [person.id, person]));
	const groupById = new Map(input.groups.map((group) => [group.id, group]));

	function assigneeLabel(type: AssignmentType, assigneeId: string): { short: string; full: string } {
		if (type.assignTo === 'group') {
			const group = groupById.get(assigneeId);
			return group ? { short: group.name, full: group.name } : { short: '?', full: 'a Group that no longer exists' };
		}
		const person = personById.get(assigneeId);
		return person
			? { short: person.lastName.toUpperCase(), full: `${person.rank} ${person.lastName}, ${person.firstName}` }
			: { short: '?', full: 'someone outside your roster' };
	}

	function assignmentLane(type: AssignmentType): CalendarLane {
		const actions = input.actions;
		const days = input.dates.map((date, index): AssignmentLaneDay => {
			const assigneeId = assigneeByDayType.get(`${dateKeys[index]}|${type.id}`);
			const day = { dateLabel: dateLabels[index], typeName: type.name };
			if (assigneeId === undefined) {
				const openDay = actions?.openDay;
				return openDay ? { ...day, open: (anchor) => openDay(type.id, date, anchor) } : day;
			}
			const assignee = assigneeLabel(type, assigneeId);
			return actions ? { ...day, assignee, edit: () => actions.editDay(date) } : { ...day, assignee };
		});
		const open = days.filter((day) => !day.assignee).length;
		return {
			key: `assignment:${type.id}`,
			kind: 'assignment-type',
			label: type.name,
			color: type.color,
			detail: open === 0 ? 'Full' : `${open} open`,
			summary: `${type.name}: ${days.length - open} of ${days.length} days assigned`,
			track: dayTrack(AssignmentLaneCell, days)
		};
	}

	return [
		...calendarLaneTypes(input.assignmentTypes).map(assignmentLane),
		daysLane(input.dates, dateKeys, input.specialDays)
	];
}

function daysLane(
	dates: readonly Date[],
	dateKeys: readonly string[],
	specialDays: readonly SpecialDay[]
): CalendarLane {
	const indexByKey = new Map(dateKeys.map((key, index) => [key, index]));
	const byIndex = new Map<number, SpecialDay[]>();
	for (const day of specialDays) {
		const index = indexByKey.get(day.date);
		if (index === undefined) continue;
		byIndex.set(index, [...(byIndex.get(index) ?? []), day]);
	}

	const runs: { start: number; end: number; days: SpecialDay[]; signature: string }[] = [];
	for (const [index, days] of [...byIndex].sort(([a], [b]) => a - b)) {
		const signature = days.map((day) => `${day.type}|${day.name}`).join('\n');
		const last = runs.at(-1);
		if (last && last.end === index - 1 && last.signature === signature) last.end = index;
		else runs.push({ start: index, end: index, days, signature });
	}

	const segments = runs.map((run, position): LaneSegment<DaysLaneSegment> => {
		const nextStart = runs[position + 1]?.start ?? dateKeys.length;
		const from = SHORT_DATE.format(dates[run.start]);
		const range = run.start === run.end ? from : `${from} to ${SHORT_DATE.format(dates[run.end])}`;
		return {
			start: run.start,
			end: run.end,
			value: {
				name: run.days.map((day) => day.name).join(' / '),
				type: run.days[0].type,
				label: `${run.days.map((day) => `${day.name}, ${SPECIAL_DAY_KIND[day.type]}`).join('; ')}, ${range}`,
				days: run.end - run.start + 1,
				room: nextStart - run.end - 1
			}
		};
	});

	return {
		key: 'days',
		kind: 'days',
		label: 'Days',
		summary:
			segments.length === 0
				? 'Days: no holidays or closures'
				: `Days: ${segments.map((segment) => segment.value.label).join('. ')}`,
		track: spanTrack(DaysLaneSegmentView, segments)
	};
}

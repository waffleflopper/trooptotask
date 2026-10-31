import { describe, expect, it } from 'vitest';
import { formatDate as formatLocal } from '$lib/utils/dates';
import type { AssignmentType, DailyAssignment, SpecialDay } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import {
	buildCalendarLanes,
	movedTo,
	plannerColumns,
	type AssignmentLaneDay,
	type CalendarLane,
	type CalendarLaneInput,
	type DaysLaneSegment,
	type LaneSegment
} from './calendarLanes';

const dates = [1, 2, 3, 4, 5].map((day) => new Date(2026, 9, day));

function type(overrides: Partial<AssignmentType> & Pick<AssignmentType, 'id' | 'name'>): AssignmentType {
	return {
		shortName: overrides.name.slice(0, 2).toUpperCase(),
		assignTo: 'personnel',
		color: '#b91c1c',
		poolRules: null,
		weekendMode: 'same',
		excusals: [],
		showOnCalendar: true,
		sortOrder: 0,
		...overrides
	};
}

const pike: Personnel = {
	id: 'p-pike',
	rank: 'SGT',
	lastName: 'Pike',
	firstName: 'Dana',
	mos: '68W',
	clinicRole: '',
	groupId: null,
	groupName: ''
};

function build(overrides: Partial<CalendarLaneInput> = {}): CalendarLane[] {
	return buildCalendarLanes({
		dates,
		assignmentTypes: [],
		assignments: [],
		specialDays: [],
		personnel: [pike],
		groups: [{ id: 'g-alpha', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 }],
		...overrides
	});
}

function days(lane: CalendarLane): AssignmentLaneDay[] {
	if (lane.track.shape !== 'day') throw new Error(`${lane.key} is not a day track`);
	return lane.track.days as AssignmentLaneDay[];
}

function segments(lane: CalendarLane): LaneSegment<DaysLaneSegment>[] {
	if (lane.track.shape !== 'span') throw new Error(`${lane.key} is not a span track`);
	return lane.track.segments as LaneSegment<DaysLaneSegment>[];
}

function assignment(date: string, assignmentTypeId: string, assigneeId: string): DailyAssignment {
	return { id: `${date}-${assignmentTypeId}`, date, assignmentTypeId, assigneeId };
}

function specialDay(date: string, name: string, kind: SpecialDay['type'] = 'org-closure'): SpecialDay {
	return { id: `${date}-${name}`, date, name, type: kind };
}

describe('plannerColumns', () => {
	it('lists the Calendar lane types in lane order, then the planner-only types, and drops archived ones', () => {
		const columns = plannerColumns([
			type({ id: 'runner', name: 'Runner', showOnCalendar: false, sortOrder: 0 }),
			type({ id: 'sd', name: 'Staff Duty', sortOrder: 1 }),
			type({ id: 'old', name: 'Old', archivedAt: '2026-01-01T00:00:00.000Z' }),
			type({ id: 'cq', name: 'CQ', sortOrder: 0 }),
			type({ id: 'aide', name: 'Aide', showOnCalendar: false, sortOrder: 0 })
		]);

		expect(columns.map((column) => column.id)).toEqual(['cq', 'sd', 'aide', 'runner']);
	});
});

describe('buildCalendarLanes', () => {
	it('orders shown active types by sort order then id, followed by Days', () => {
		const lanes = build({
			assignmentTypes: [
				type({ id: 'b', name: 'Bravo', sortOrder: 1 }),
				type({ id: 'c', name: 'Charlie', sortOrder: 0 }),
				type({ id: 'a', name: 'Alpha', sortOrder: 1 }),
				type({ id: 'hidden', name: 'Hidden', showOnCalendar: false }),
				type({ id: 'old', name: 'Old', archivedAt: '2026-01-01T00:00:00.000Z' })
			]
		});

		expect(lanes.map((lane) => lane.label)).toEqual(['Charlie', 'Alpha', 'Bravo', 'Days']);
	});

	it('labels assignees from the full roster and never shows a raw id', () => {
		const [duty, group] = build({
			assignmentTypes: [
				type({ id: 'sd', name: 'Staff Duty' }),
				type({ id: 'cq', name: 'CQ', assignTo: 'group', sortOrder: 1 })
			],
			assignments: [
				assignment('2026-10-01', 'sd', 'p-pike'),
				assignment('2026-10-02', 'sd', 'p-gone'),
				assignment('2026-10-01', 'cq', 'g-alpha')
			]
		});

		const [pike, gone, ...open] = days(duty).map((day) => day.assignee);
		expect(pike).toEqual({ short: 'PIKE', full: 'SGT Pike, Dana' });
		expect(gone?.full).toBeTruthy();
		expect(`${gone?.short} ${gone?.full}`).not.toContain('p-gone');
		expect(open).toEqual([undefined, undefined, undefined]);
		expect(days(group)[0].assignee).toEqual({ short: 'Alpha', full: 'Alpha' });
		expect(duty.detail).toBe('3 open');
	});

	it('gives an open day an Assign action when the caller can open a picker, and keeps assigned days editable', () => {
		const assignmentTypes = [type({ id: 'sd', name: 'Staff Duty' })];
		const assignments = [assignment('2026-10-01', 'sd', 'p-pike')];
		const opened: string[] = [];

		const [ready] = build({
			assignmentTypes,
			assignments,
			actions: { editDay: () => {}, openDay: (typeId, date) => opened.push(`${typeId}:${date.getDate()}`) }
		});
		days(ready)[2].open?.({} as HTMLElement);
		expect(days(ready).map((day) => !!day.open)).toEqual([false, true, true, true, true]);
		expect(days(ready)[0].edit).toBeTruthy();
		expect(opened).toEqual(['sd:3']);
	});

	it('reports a fully assigned lane as Full', () => {
		const [duty] = build({
			assignmentTypes: [type({ id: 'sd', name: 'Staff Duty' })],
			assignments: dates.map((_, index) => assignment(`2026-10-0${index + 1}`, 'sd', 'p-pike'))
		});

		expect(duty.detail).toBe('Full');
	});

	it('merges consecutive same special days into one Days segment', () => {
		const daysLane = build({
			specialDays: [
				specialDay('2026-10-01', 'Training holiday'),
				specialDay('2026-10-02', 'Training holiday'),
				specialDay('2026-10-04', 'Columbus Day', 'federal-holiday'),
				specialDay('2026-11-01', 'Out of range')
			]
		}).at(-1)!;

		expect(
			segments(daysLane).map(({ start, end, value }) => ({ start, end, name: value.name, type: value.type }))
		).toEqual([
			{ start: 0, end: 1, name: 'Training holiday', type: 'org-closure' },
			{ start: 3, end: 3, name: 'Columbus Day', type: 'federal-holiday' }
		]);
	});

	it('keeps every special day on a shared date', () => {
		const daysLane = build({
			specialDays: [specialDay('2026-10-03', 'Closure'), specialDay('2026-10-03', 'Columbus Day', 'federal-holiday')]
		}).at(-1)!;

		const [shared, ...rest] = segments(daysLane);
		expect(rest).toEqual([]);
		expect(shared.start).toBe(2);
		for (const part of ['Closure', 'closure', 'Columbus Day', 'federal holiday']) {
			expect(shared.value.label).toContain(part);
		}
	});
});

describe('assignment lanes on days a type takes no duty', () => {
	const actions = { editDay: () => {}, openDay: () => {} };
	// 3 and 4 October 2026 are the Saturday and Sunday; the closure makes Friday the 2nd a holiday.
	const closure = specialDay('2026-10-02', 'Training holiday');
	const buttons = (lane: CalendarLane) => days(lane).filter((day) => day.open).length;

	function laneOf(weekendMode: AssignmentType['weekendMode'], overrides: Partial<CalendarLaneInput> = {}) {
		return build({
			assignmentTypes: [type({ id: 'sd', name: 'Staff Duty', weekendMode })],
			specialDays: [closure],
			actions,
			...overrides
		})[0];
	}

	it('offers no assign button on weekends or closures under No duty, and counts only the days that take duty', () => {
		const lane = laneOf('none');

		expect(days(lane).map((day) => !!day.open)).toEqual([true, false, false, false, true]);
		expect(lane.detail).toBe('2 open');
		expect(lane.summary).toMatch(/\b0\b.*\b2\b/);
	});

	it.each(['same', 'separate'] as const)('keeps every unassigned day open under %s', (mode) => {
		const lane = laneOf(mode);

		expect(days(lane).map((day) => !!day.open)).toEqual([true, true, true, true, true]);
		expect(lane.detail).toBe('5 open');
	});

	it('ignores a stale No duty setting on a Group duty', () => {
		const [lane] = build({
			assignmentTypes: [type({ id: 'cq', name: 'CQ', assignTo: 'group', weekendMode: 'none' })],
			specialDays: [closure],
			actions
		});

		expect(buttons(lane)).toBe(5);
		expect(lane.detail).toBe('5 open');
	});

	it('keeps a stored assignment on a No duty day shown and editable, and counts it as assigned', () => {
		const edited: string[] = [];
		const lane = laneOf('none', {
			assignments: [assignment('2026-10-03', 'sd', 'p-pike'), assignment('2026-10-01', 'sd', 'p-pike')],
			actions: { ...actions, editDay: (date) => edited.push(formatLocal(date)) }
		});

		const saturday = days(lane)[2];
		expect(saturday.assignee?.short).toBe('PIKE');
		saturday.edit?.();
		expect(edited).toEqual(['2026-10-03']);
		expect(lane.detail).toBe('1 open');
		expect(lane.summary).toMatch(/\b2\b.*\b3\b/);
	});

	it('reports Full once every day that takes duty is assigned, whatever the weekend holds', () => {
		const lane = laneOf('none', {
			assignments: [assignment('2026-10-01', 'sd', 'p-pike'), assignment('2026-10-05', 'sd', 'p-pike')]
		});

		expect(lane.detail).toBe('Full');
		expect(buttons(lane)).toBe(0);
	});

	it.each([
		['none', 2],
		['same', 5]
	] as const)('shows as many assign buttons as the "N open" label says under %s', (mode, expected) => {
		const lane = laneOf(mode);

		expect(lane.detail).toBe(`${expected} open`);
		expect(buttons(lane)).toBe(expected);
	});

	it('shows no count while the range has not loaded, and keeps the label', () => {
		const lane = laneOf('none', { assignmentsLoaded: false, actions: { editDay: () => {} } });

		expect(lane.label).toBe('Staff Duty');
		expect(lane.detail).toBeUndefined();
		expect(lane.summary).not.toMatch(/\d/);
		expect(buttons(lane)).toBe(0);
	});

	it('keeps the open count for a reader with no actions on a loaded range', () => {
		const lane = laneOf('none', { actions: undefined });

		expect(lane.detail).toBe('2 open');
		expect(buttons(lane)).toBe(0);
	});
});

describe('movedTo', () => {
	it('moves an id to the first and last positions', () => {
		expect(movedTo(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
		expect(movedTo(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
	});
});

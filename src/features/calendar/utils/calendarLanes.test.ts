import { describe, expect, it, vi } from 'vitest';
import type { AssignmentType, DailyAssignment, SpecialDay } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import {
	buildCalendarLanes,
	movedTo,
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
		exemptPersonnelIds: [],
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
		groups: [{ id: 'g-alpha', name: 'Alpha', sortOrder: 0 }],
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

		expect(days(duty).map((day) => day.assignee)).toEqual([
			{ short: 'PIKE', full: 'SGT Pike, Dana' },
			{ short: '?', full: 'someone outside your roster' },
			undefined,
			undefined,
			undefined
		]);
		expect(days(group)[0].assignee).toEqual({ short: 'Alpha', full: 'Alpha' });
		expect(duty.detail).toBe('3 open');
		expect(duty.summary).toBe('Staff Duty: 2 of 5 days assigned');
	});

	it('reports a fully assigned lane as Full', () => {
		const [duty] = build({
			assignmentTypes: [type({ id: 'sd', name: 'Staff Duty' })],
			assignments: dates.map((_, index) => assignment(`2026-10-0${index + 1}`, 'sd', 'p-pike'))
		});

		expect(duty.detail).toBe('Full');
	});

	it('offers open and edit actions only when actions are given', () => {
		const actions = { openDay: vi.fn(), editDay: vi.fn() };
		const input = {
			assignmentTypes: [type({ id: 'sd', name: 'Staff Duty' })],
			assignments: [assignment('2026-10-01', 'sd', 'p-pike')]
		};
		const viewer = days(build(input)[0]);
		const manager = days(build({ ...input, actions })[0]);

		expect(viewer.some((day) => day.open || day.edit)).toBe(false);
		expect(manager[0].open).toBeUndefined();
		manager[0].edit?.();
		expect(actions.editDay).toHaveBeenCalledWith(dates[0]);
		const anchor = {} as HTMLElement;
		manager[1].open?.(anchor);
		expect(actions.openDay).toHaveBeenCalledWith('sd', dates[1], anchor);
		expect(manager[1]).toMatchObject({ dateLabel: 'Friday, October 2, 2026', typeName: 'Staff Duty' });
	});

	it('merges consecutive same special days into one Days segment with room to the next', () => {
		const daysLane = build({
			specialDays: [
				specialDay('2026-10-01', 'Training holiday'),
				specialDay('2026-10-02', 'Training holiday'),
				specialDay('2026-10-04', 'Columbus Day', 'federal-holiday'),
				specialDay('2026-11-01', 'Out of range')
			]
		}).at(-1)!;

		expect(segments(daysLane)).toEqual([
			{
				start: 0,
				end: 1,
				value: {
					name: 'Training holiday',
					type: 'org-closure',
					label: 'Training holiday, closure, October 1 to October 2',
					days: 2,
					room: 1
				}
			},
			{
				start: 3,
				end: 3,
				value: {
					name: 'Columbus Day',
					type: 'federal-holiday',
					label: 'Columbus Day, federal holiday, October 4',
					days: 1,
					room: 1
				}
			}
		]);
	});

	it('keeps every special day on a shared date', () => {
		const daysLane = build({
			specialDays: [specialDay('2026-10-03', 'Closure'), specialDay('2026-10-03', 'Columbus Day', 'federal-holiday')]
		}).at(-1)!;

		expect(segments(daysLane).map((segment) => segment.value.label)).toEqual([
			'Closure, closure; Columbus Day, federal holiday, October 3'
		]);
		expect(segments(daysLane)[0].value.name).toBe('Closure / Columbus Day');
	});

	it('summarizes an empty Days lane', () => {
		expect(build().map((lane) => lane.summary)).toEqual(['Days: no holidays or closures']);
	});
});

describe('movedTo', () => {
	it('moves an id to the first and last positions', () => {
		expect(movedTo(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
		expect(movedTo(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
		expect(movedTo(['a', 'b', 'c'], 'b', 9)).toEqual(['a', 'c', 'b']);
		expect(movedTo(['a', 'b'], 'missing', 0)).toEqual(['a', 'b']);
	});
});

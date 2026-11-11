import { describe, expect, it } from 'vitest';
import type {
	AssignmentType,
	AvailabilityEntry,
	DailyAssignment,
	SpecialDay,
	StatusType
} from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import {
	buildCopyPlan,
	buildPlannerTable,
	buildQuickFillBatch,
	monthWeekStarts,
	type CopySpan
} from './assignmentPlanner';
import { mondayOf } from '$lib/utils/dayNumber';
import { indexAssignmentsBySlot } from './calendarIndexes';
import { findDutyConflicts, indexDutyAvailability } from './dutyReadModel';

const october = new Date(2026, 9, 1);

function assignment(date: string, assignmentTypeId: string, assigneeId: string): DailyAssignment {
	return { id: `${date}-${assignmentTypeId}`, date, assignmentTypeId, assigneeId };
}

function type(id: string, overrides: Partial<AssignmentType> = {}): AssignmentType {
	return {
		id,
		name: `Duty ${id}`,
		shortName: id.toUpperCase(),
		assignTo: 'personnel',
		color: '#000',
		poolRules: null,
		weekendMode: 'same',
		excusals: [],
		showOnCalendar: true,
		sortOrder: 0,
		...overrides
	};
}

function person(id: string, rank: string, lastName: string, firstName: string): Personnel {
	return { id, rank, lastName, firstName, mos: '', clinicRole: '', groupId: null, groupName: '' };
}

function datesOf(batch: { date: string }[]): string[] {
	return batch.map((write) => write.date);
}

describe('buildPlannerTable double-booking', () => {
	const columns = [type('sd', { name: 'Staff Duty' }), type('cq', { name: 'CQ' }), type('gg', { assignTo: 'group' })];
	const assignments = [
		assignment('2026-10-20', 'sd', 'p-kim'),
		assignment('2026-10-20', 'cq', 'p-kim'),
		assignment('2026-10-21', 'sd', 'p-kim'),
		assignment('2026-10-21', 'cq', 'p-okafor'),
		assignment('2026-10-22', 'sd', 'g-2nd'),
		assignment('2026-10-22', 'gg', 'g-2nd')
	];

	function table(rosters?: Parameters<typeof buildPlannerTable>[0]['rosters']) {
		return buildPlannerTable({
			rosters,
			anchor: october,
			todayKey: '2026-10-16',
			columns,
			assignmentsBySlot: indexAssignmentsBySlot(assignments),
			conflicts: findDutyConflicts({
				assignments,
				assignmentTypes: columns,
				availabilityByPerson: indexDutyAvailability([]),
				range: { rangeStart: '2026-10-01', rangeEnd: '2026-10-31' }
			}),
			personnel: [person('p-kim', 'SGT', 'Kim', 'Jae-won'), person('p-okafor', 'SGT', 'Okafor', 'Ife')],
			groups: [{ id: 'g-2nd', name: '2nd Platoon', sortOrder: 0, parentId: null, depth: 1 as const }],
			specialDays: [],
			statusTypes: []
		});
	}

	it('flags a person holding two duties on one day with D, each naming the other duty, when no roster view is used', () => {
		const result = table();

		expect(result.conflicts.map((conflict) => [conflict.typeId, conflict.dateKey, conflict.reason])).toEqual([
			['sd', '2026-10-20', 'CQ (D)'],
			['cq', '2026-10-20', 'Staff Duty (D)']
		]);
		const cell = result.rows.find((row) => row.dateKey === '2026-10-20')!.cells[0];
		expect(cell.conflict?.assignee.name).toBe('Kim');
	});

	it("leaves the double-booking to a roster on the days it covers and names it locally on the days it doesn't", () => {
		const everyOctoberDay = new Set(
			Array.from({ length: 31 }, (_, at) => `2026-10-${String(at + 1).padStart(2, '0')}`)
		);
		const roster = { covered: everyOctoberDay, conflicts: [] };

		expect(
			table(
				new Map([
					['sd', roster],
					['cq', roster]
				])
			).conflicts
		).toEqual([]);
	});

	it('flags a Saturday double-booking with D naming the other duty when the roster is a No duty roster that skips weekends', () => {
		const saturday = '2026-10-24';
		const weekdays = new Set(['2026-10-23', '2026-10-26']);
		const noDuty = { covered: weekdays, conflicts: [] };
		const weekend = [assignment(saturday, 'sd', 'p-kim'), assignment(saturday, 'cq', 'p-kim')];

		const result = buildPlannerTable({
			anchor: october,
			todayKey: '2026-10-16',
			columns,
			assignmentsBySlot: indexAssignmentsBySlot(weekend),
			conflicts: findDutyConflicts({
				assignments: weekend,
				assignmentTypes: columns,
				availabilityByPerson: indexDutyAvailability([]),
				range: { rangeStart: '2026-10-01', rangeEnd: '2026-10-31' }
			}),
			rosters: new Map([['sd', noDuty]]),
			personnel: [person('p-kim', 'SGT', 'Kim', 'Jae-won')],
			groups: [],
			specialDays: [],
			statusTypes: []
		});

		expect(result.conflicts.map((conflict) => [conflict.typeId, conflict.dateKey, conflict.reason])).toEqual([
			['sd', saturday, 'CQ (D)'],
			['cq', saturday, 'Staff Duty (D)']
		]);
	});
});

describe('buildQuickFillBatch', () => {
	const occupied = indexAssignmentsBySlot([
		assignment('2026-10-17', 'sd', 'p-hale'),
		assignment('2026-10-24', 'cq', 'p-hale'),
		assignment('2026-10-07', 'sd', 'p-hale')
	]);
	const base = { anchor: october, typeId: 'sd', assigneeId: 'p-kim', assignmentsBySlot: occupied };

	it('writes the weekend dates of the month, leaving this type’s occupied slot with Only open days on', () => {
		const batch = buildQuickFillBatch({ ...base, days: 'weekends', onlyOpenDays: true });

		expect(datesOf(batch)).toEqual([
			'2026-10-03',
			'2026-10-04',
			'2026-10-10',
			'2026-10-11',
			'2026-10-18',
			'2026-10-24',
			'2026-10-25',
			'2026-10-31'
		]);
		expect(batch.every((write) => write.assignmentTypeId === 'sd' && write.assigneeId === 'p-kim')).toBe(true);
	});

	it('overwrites occupied slots when Only open days is off', () => {
		expect(datesOf(buildQuickFillBatch({ ...base, days: 'weekends', onlyOpenDays: false }))).toEqual([
			'2026-10-03',
			'2026-10-04',
			'2026-10-10',
			'2026-10-11',
			'2026-10-17',
			'2026-10-18',
			'2026-10-24',
			'2026-10-25',
			'2026-10-31'
		]);
	});

	it('picks weekdays or every day of the month', () => {
		const weekdays = datesOf(buildQuickFillBatch({ ...base, days: 'weekdays', onlyOpenDays: false }));
		expect(weekdays).toHaveLength(22);
		expect(weekdays.slice(0, 3)).toEqual(['2026-10-01', '2026-10-02', '2026-10-05']);
		expect(buildQuickFillBatch({ ...base, days: 'all', onlyOpenDays: false })).toHaveLength(31);
		expect(buildQuickFillBatch({ ...base, days: 'all', onlyOpenDays: true })).toHaveLength(29);
	});
});

describe('buildPlannerTable', () => {
	const columns = [type('cq', { name: 'CQ' }), type('gg', { name: 'Gate Guard', assignTo: 'group' })];
	const roster = [person('p-okafor', 'SGT', 'Okafor', 'Ife'), person('p-kim', 'SGT', 'Kim', 'Jae-won')];
	const assignments = [
		assignment('2026-10-21', 'cq', 'p-okafor'),
		assignment('2026-10-22', 'cq', 'p-kim'),
		assignment('2026-10-22', 'gg', 'g-2nd'),
		assignment('2026-10-23', 'cq', 'p-gone'),
		assignment('2026-11-01', 'cq', 'p-kim')
	];
	const leave: AvailabilityEntry[] = [
		{ id: 'leave-1', personnelId: 'p-okafor', statusTypeId: 'leave', startDate: '2026-10-20', endDate: '2026-10-23' }
	];

	function table(rosters?: Parameters<typeof buildPlannerTable>[0]['rosters']) {
		return buildPlannerTable({
			rosters,
			anchor: october,
			todayKey: '2026-10-16',
			columns,
			assignmentsBySlot: indexAssignmentsBySlot(assignments),
			conflicts: findDutyConflicts({
				assignments,
				assignmentTypes: columns,
				availabilityByPerson: indexDutyAvailability(leave),
				range: { rangeStart: '2026-10-01', rangeEnd: '2026-10-31' }
			}),
			personnel: roster,
			groups: [{ id: 'g-2nd', name: '2nd Platoon', sortOrder: 0, parentId: null, depth: 1 as const }],
			specialDays: [{ id: 'sd-1', date: '2026-10-12', name: 'Columbus Day', type: 'federal-holiday' }],
			statusTypes: [
				{
					id: 'leave',
					name: 'Leave',
					color: '#0a0',
					textColor: '#fff',
					shortLabel: null,
					rosterEffect: 'A',
					sortOrder: 0,
					archivedAt: null
				}
			]
		});
	}

	it('counts filled days per column over this month only', () => {
		expect(table().columns.map((column) => [column.type.id, column.filledDays, column.totalDays])).toEqual([
			['cq', 3, 31],
			['gg', 1, 31]
		]);
	});

	it('labels each date with its weekend, today, past and holiday treatment', () => {
		const rows = new Map(table().rows.map((row) => [row.dateKey, row]));

		expect(rows.get('2026-10-12')).toMatchObject({ specialDayName: 'Columbus Day', past: true });
		expect(rows.get('2026-10-16')).toMatchObject({ today: true, past: false, weekend: false });
		expect(rows.get('2026-10-17')).toMatchObject({ weekend: true, past: false, specialDayName: null });
	});

	it('shows assigned people by rank and last name, Groups by name and an unknown person without hiding them', () => {
		const cells = new Map(table().rows.map((row) => [row.dateKey, row.cells]));

		expect(cells.get('2026-10-21')![0].assignee).toMatchObject({ id: 'p-okafor', prefix: 'SGT', name: 'Okafor' });
		expect(cells.get('2026-10-22')![1].assignee).toMatchObject({ id: 'g-2nd', prefix: null, name: '2nd Platoon' });
		expect(cells.get('2026-10-23')![0].assignee).toMatchObject({ id: 'p-gone', prefix: null });
		expect(cells.get('2026-10-20')![0].assignee).toBeNull();
	});

	it('presents each conflict once, on its cell and in the list', () => {
		const result = table();

		expect(result.conflicts.map((conflict) => [conflict.typeId, conflict.dateKey])).toEqual([['cq', '2026-10-21']]);
		const flagged = result.rows.flatMap((row) => row.cells).filter((cell) => cell.conflict);
		expect(flagged.map((cell) => [cell.typeId, cell.dateKey])).toEqual([['cq', '2026-10-21']]);
	});

	it("takes a roster's conflicts on the days it details and the availability check on every other day", () => {
		const covered = new Set(['2026-10-22']);
		const conflicts = [{ date: '2026-10-22', personId: 'p-kim', code: 'D' as const, reason: 'Detail' }];

		const result = table(new Map([['cq', { covered, conflicts }]]));

		expect(result.conflicts.map((conflict) => [conflict.dateKey, conflict.assignee.name])).toEqual([
			['2026-10-21', 'Okafor'],
			['2026-10-22', 'Kim']
		]);
	});
});

describe('copying the previous week or month', () => {
	const november = new Date(2026, 10, 1);
	const february = new Date(2027, 1, 1);
	const leave: StatusType = {
		id: 'leave',
		name: 'Leave',
		color: '#2563eb',
		textColor: '#ffffff',
		shortLabel: 'L',
		sortOrder: 0,
		rosterEffect: 'A',
		archivedAt: null
	};
	const cq = type('cq', { name: 'CQ' });
	const sd = type('sd', { name: 'SD' });
	const weekdaysOnly = type('wk', { name: 'Weekday duty', weekendMode: 'none' });
	const platoon = type('gg', { name: 'Platoon duty', assignTo: 'group', weekendMode: 'none' });

	function plan(input: {
		anchor?: Date;
		span: CopySpan;
		assignments: DailyAssignment[];
		columns?: AssignmentType[];
		entries?: AvailabilityEntry[];
		specialDays?: SpecialDay[];
		personnelIds?: ReadonlySet<string>;
	}) {
		return buildCopyPlan({
			anchor: input.anchor ?? november,
			span: input.span,
			columns: input.columns ?? [cq],
			assignmentsBySlot: indexAssignmentsBySlot(input.assignments),
			availabilityByPerson: indexDutyAvailability(input.entries ?? []),
			personnelIds: input.personnelIds ?? new Set(input.assignments.map((row) => row.assigneeId)),
			statusTypes: [leave],
			specialDays: input.specialDays ?? []
		});
	}
	const week = (weekStart: string): CopySpan => ({ kind: 'week', weekStart });

	it('lists the Monday of every week that overlaps the month, including the one that starts the month before', () => {
		expect(monthWeekStarts(november)).toEqual([
			'2026-10-26',
			'2026-11-02',
			'2026-11-09',
			'2026-11-16',
			'2026-11-23',
			'2026-11-30'
		]);
		expect(['2026-11-01', '2026-11-02', '2026-11-08'].map(mondayOf)).toEqual([
			'2026-10-26',
			'2026-11-02',
			'2026-11-02'
		]);
	});

	it('lines a week up by weekday, reading days before the month and days inside it', () => {
		const assignments = [
			assignment('2026-10-25', 'cq', 'p-a'),
			assignment('2026-10-26', 'cq', 'p-b'),
			assignment('2026-10-31', 'cq', 'p-c')
		];

		expect(
			plan({ span: week('2026-10-26'), assignments: [...assignments, assignment('2026-11-01', 'cq', 'p-d')] })
		).toMatchObject({ writes: [], filled: 1 });
		expect(plan({ span: week('2026-10-26'), assignments }).writes).toEqual([
			{ date: '2026-11-01', assignmentTypeId: 'cq', assigneeId: 'p-a' }
		]);
		expect(
			plan({ span: week('2026-11-02'), assignments: [...assignments, assignment('2026-11-01', 'cq', 'p-d')] }).writes
		).toEqual([
			{ date: '2026-11-02', assignmentTypeId: 'cq', assigneeId: 'p-b' },
			{ date: '2026-11-07', assignmentTypeId: 'cq', assigneeId: 'p-c' },
			{ date: '2026-11-08', assignmentTypeId: 'cq', assigneeId: 'p-d' }
		]);
	});

	it('lines a month up by day number and lists each day the target month lacks', () => {
		const assignments = [
			assignment('2027-01-15', 'cq', 'p-a'),
			assignment('2027-01-28', 'cq', 'p-b'),
			assignment('2027-01-29', 'cq', 'p-c'),
			assignment('2027-01-31', 'sd', 'p-d')
		];

		const result = plan({ anchor: february, span: { kind: 'month' }, assignments, columns: [cq, sd] });

		expect(result.writes).toEqual([
			{ date: '2027-02-15', assignmentTypeId: 'cq', assigneeId: 'p-a' },
			{ date: '2027-02-28', assignmentTypeId: 'cq', assigneeId: 'p-b' }
		]);
		expect(result.skips).toEqual([
			{ typeId: 'cq', sourceDate: '2027-01-29', targetDate: null, assigneeId: 'p-c', reason: 'missing-day' },
			{ typeId: 'sd', sourceDate: '2027-01-31', targetDate: null, assigneeId: 'p-d', reason: 'missing-day' }
		]);
	});

	it('copies the month before January from the December before it', () => {
		const result = plan({
			anchor: new Date(2027, 0, 1),
			span: { kind: 'month' },
			assignments: [assignment('2026-12-31', 'cq', 'p-a')]
		});

		expect(result.writes).toEqual([{ date: '2027-01-31', assignmentTypeId: 'cq', assigneeId: 'p-a' }]);
	});

	it('skips a target day the duty takes no duty on, for weekends and Special Days, but still copies a Group duty', () => {
		const assignments = [
			assignment('2026-10-27', 'wk', 'p-a'),
			assignment('2026-10-31', 'wk', 'p-b'),
			assignment('2026-10-31', 'gg', 'g-alpha'),
			assignment('2026-10-28', 'wk', 'p-c')
		];

		const result = plan({
			span: week('2026-11-02'),
			assignments,
			columns: [weekdaysOnly, platoon],
			specialDays: [{ id: 'closure', date: '2026-11-03', name: 'Training holiday', type: 'org-closure' }]
		});

		expect(result.writes).toEqual([
			{ date: '2026-11-04', assignmentTypeId: 'wk', assigneeId: 'p-c' },
			{ date: '2026-11-07', assignmentTypeId: 'gg', assigneeId: 'g-alpha' }
		]);
		expect(result.skips).toEqual([
			{ typeId: 'wk', sourceDate: '2026-10-27', targetDate: '2026-11-03', assigneeId: 'p-a', reason: 'no-duty' },
			{ typeId: 'wk', sourceDate: '2026-10-31', targetDate: '2026-11-07', assigneeId: 'p-b', reason: 'no-duty' }
		]);
	});

	it('skips a person unavailable on the target day with why, and copies a Group whatever its id is covered by', () => {
		const result = plan({
			span: week('2026-11-02'),
			assignments: [
				assignment('2026-10-27', 'cq', 'p-a'),
				assignment('2026-10-28', 'cq', 'p-a'),
				assignment('2026-10-29', 'cq', 'p-b'),
				assignment('2026-10-27', 'gg', 'g-alpha')
			],
			columns: [cq, platoon],
			entries: [
				{ id: 'e1', personnelId: 'p-a', statusTypeId: 'leave', startDate: '2026-11-03', endDate: '2026-11-03' },
				{ id: 'e2', personnelId: 'p-a', statusTypeId: 'leave', startDate: '2026-11-03', endDate: '2026-11-05' },
				{ id: 'e3', personnelId: 'g-alpha', statusTypeId: 'leave', startDate: '2026-11-03', endDate: '2026-11-03' }
			]
		});

		expect(result.writes).toEqual([
			{ date: '2026-11-03', assignmentTypeId: 'gg', assigneeId: 'g-alpha' },
			{ date: '2026-11-05', assignmentTypeId: 'cq', assigneeId: 'p-b' }
		]);
		expect(result.skips).toEqual([
			{
				typeId: 'cq',
				sourceDate: '2026-10-27',
				targetDate: '2026-11-03',
				assigneeId: 'p-a',
				reason: 'unavailable',
				detail: 'Leave 3 Nov; Leave 3–5 Nov'
			},
			{
				typeId: 'cq',
				sourceDate: '2026-10-28',
				targetDate: '2026-11-04',
				assigneeId: 'p-a',
				reason: 'unavailable',
				detail: 'Leave 3–5 Nov'
			}
		]);
	});

	it('skips a person no longer on the roster, but still copies a Group', () => {
		const result = plan({
			span: week('2026-11-02'),
			assignments: [
				assignment('2026-10-27', 'cq', 'p-gone'),
				assignment('2026-10-28', 'cq', 'p-b'),
				assignment('2026-10-27', 'gg', 'g-alpha')
			],
			columns: [cq, platoon],
			personnelIds: new Set(['p-b'])
		});

		expect(result.writes).toEqual([
			{ date: '2026-11-03', assignmentTypeId: 'gg', assigneeId: 'g-alpha' },
			{ date: '2026-11-04', assignmentTypeId: 'cq', assigneeId: 'p-b' }
		]);
		expect(result.skips).toEqual([
			{ typeId: 'cq', sourceDate: '2026-10-27', targetDate: '2026-11-03', assigneeId: 'p-gone', reason: 'off-roster' }
		]);
	});

	it('skips a person since excused from the duty, with the excusal reason', () => {
		const excusing = type('cq', { excusals: [{ personId: 'p-a', reason: 'Profile', startsOn: '2026-10-30' }] });
		const result = plan({
			span: week('2026-11-02'),
			assignments: [assignment('2026-10-27', 'cq', 'p-a'), assignment('2026-10-28', 'cq', 'p-b')],
			columns: [excusing]
		});

		expect(result.writes).toEqual([{ date: '2026-11-04', assignmentTypeId: 'cq', assigneeId: 'p-b' }]);
		expect(result.skips).toEqual([
			{
				typeId: 'cq',
				sourceDate: '2026-10-27',
				targetDate: '2026-11-03',
				assigneeId: 'p-a',
				reason: 'excused',
				detail: 'Profile'
			}
		]);
	});

	it('leaves a filled target alone and counts it only where there was something to copy', () => {
		const result = plan({
			span: week('2026-11-02'),
			assignments: [
				assignment('2026-10-26', 'cq', 'p-a'),
				assignment('2026-11-02', 'cq', 'p-keep'),
				assignment('2026-11-03', 'cq', 'p-other'),
				assignment('2026-10-28', 'cq', 'p-b')
			]
		});

		expect(result.writes).toEqual([{ date: '2026-11-04', assignmentTypeId: 'cq', assigneeId: 'p-b' }]);
		expect(result.skips).toEqual([]);
		expect(result.filled).toBe(1);
	});

	it('sorts skips by date, then by column order', () => {
		const result = plan({
			span: week('2026-11-02'),
			columns: [cq, sd],
			assignments: [
				assignment('2026-10-28', 'sd', 'p-a'),
				assignment('2026-10-28', 'cq', 'p-a'),
				assignment('2026-10-27', 'sd', 'p-a')
			],
			entries: [{ id: 'e', personnelId: 'p-a', statusTypeId: 'leave', startDate: '2026-11-03', endDate: '2026-11-04' }]
		});

		expect(result.skips.map((skip) => `${skip.targetDate} ${skip.typeId}`)).toEqual([
			'2026-11-03 sd',
			'2026-11-04 cq',
			'2026-11-04 sd'
		]);
	});
});

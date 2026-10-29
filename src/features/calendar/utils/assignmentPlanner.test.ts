import { describe, expect, it } from 'vitest';
import type { AssignmentType, AvailabilityEntry, DailyAssignment } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import { buildPlannerTable, buildQuickFillBatch } from './assignmentPlanner';
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
					sortOrder: 0
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

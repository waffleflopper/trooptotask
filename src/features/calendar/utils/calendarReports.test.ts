import { describe, expect, it } from 'vitest';
import type { Group, Personnel } from '$features/personnel/contracts';
import type { AssignmentType, AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import {
	computeAssignmentCoverage,
	computeAvailabilityForecast,
	computeGroupReadiness,
	readinessTone,
	computePersonnelTempo
} from './calendarReports';
import { computeStatusDays } from './statusDaysReport';

function person(overrides: Partial<Personnel>): Personnel {
	return {
		id: overrides.id ?? 'person-1',
		rank: overrides.rank ?? 'SGT',
		lastName: overrides.lastName ?? 'Smith',
		firstName: overrides.firstName ?? 'Sam',
		mos: '11B',
		clinicRole: 'Duty Role',
		groupId: overrides.groupId ?? 'group-a',
		groupName: overrides.groupName ?? 'Alpha',
		...overrides
	};
}

function availability(overrides: Partial<AvailabilityEntry>): AvailabilityEntry {
	return {
		id: overrides.id ?? 'availability-1',
		personnelId: overrides.personnelId ?? 'person-1',
		statusTypeId: overrides.statusTypeId ?? 'leave',
		startDate: overrides.startDate ?? '2026-03-01',
		endDate: overrides.endDate ?? '2026-03-01',
		note: null,
		...overrides
	};
}

const statusTypes: StatusType[] = [
	{
		id: 'leave',
		name: 'Leave',
		color: '#2563eb',
		textColor: '#ffffff',
		shortLabel: null,
		rosterEffect: 'A',
		sortOrder: 0
	},
	{
		id: 'school',
		name: 'School',
		color: '#16a34a',
		textColor: '#ffffff',
		shortLabel: null,
		rosterEffect: 'A',
		sortOrder: 1
	}
];

describe('computeAvailabilityForecast', () => {
	it('preserves overlapping-entry first-match details across a long date range', () => {
		const personnel = [
			person({ id: 'person-1', lastName: 'Able' }),
			person({ id: 'person-2', lastName: 'Baker' }),
			person({ id: 'person-3', lastName: 'Clark' })
		];
		const result = computeAvailabilityForecast(
			personnel,
			[
				availability({
					id: 'leave-1',
					personnelId: 'person-1',
					statusTypeId: 'leave',
					startDate: '2026-03-01',
					endDate: '2026-03-20'
				}),
				availability({
					id: 'school-1',
					personnelId: 'person-1',
					statusTypeId: 'school',
					startDate: '2026-03-10',
					endDate: '2026-03-12'
				}),
				availability({
					id: 'school-2',
					personnelId: 'person-2',
					statusTypeId: 'school',
					startDate: '2026-03-15',
					endDate: '2026-03-15'
				})
			],
			statusTypes,
			'2026-03-01',
			'2026-04-29'
		);

		expect(result.days).toHaveLength(60);
		expect(result.days.find((day) => day.date === '2026-03-10')?.unavailablePersonnel).toEqual([
			{ person: personnel[0], statusName: 'Leave', statusColor: '#2563eb' }
		]);
		expect(result.days.find((day) => day.date === '2026-03-15')).toMatchObject({
			unavailableCount: 2,
			availableCount: 1,
			availablePercent: 33
		});
		expect(result.days.find((day) => day.date === '2026-04-29')).toMatchObject({
			unavailableCount: 0,
			availableCount: 3,
			availablePercent: 100
		});
	});

	it('handles empty personnel and empty entries without special-case scans', () => {
		const result = computeAvailabilityForecast([], [], statusTypes, '2026-03-01', '2026-03-03');

		expect(result.days).toEqual([
			{
				date: '2026-03-01',
				totalPersonnel: 0,
				unavailableCount: 0,
				availableCount: 0,
				availablePercent: 100,
				unavailablePersonnel: []
			},
			{
				date: '2026-03-02',
				totalPersonnel: 0,
				unavailableCount: 0,
				availableCount: 0,
				availablePercent: 100,
				unavailablePersonnel: []
			},
			{
				date: '2026-03-03',
				totalPersonnel: 0,
				unavailableCount: 0,
				availableCount: 0,
				availablePercent: 100,
				unavailablePersonnel: []
			}
		]);
	});
});

describe('computeGroupReadiness', () => {
	it('preserves selected-group readiness and ignores unselected or ungrouped personnel', () => {
		const personnel = [
			person({ id: 'alpha-1', groupId: 'group-a', groupName: 'Alpha' }),
			person({ id: 'alpha-2', groupId: 'group-a', groupName: 'Alpha' }),
			person({ id: 'bravo-1', groupId: 'group-b', groupName: 'Bravo' }),
			person({ id: 'ungrouped', groupId: null, groupName: '' })
		];
		const result = computeGroupReadiness(
			personnel,
			[
				availability({ id: 'alpha-leave', personnelId: 'alpha-1', startDate: '2026-03-01', endDate: '2026-03-03' }),
				availability({
					id: 'alpha-long-range',
					personnelId: 'alpha-2',
					startDate: '2026-04-29',
					endDate: '2026-04-29'
				}),
				availability({ id: 'bravo-leave', personnelId: 'bravo-1', startDate: '2026-03-02', endDate: '2026-03-02' }),
				availability({
					id: 'ungrouped-leave',
					personnelId: 'ungrouped',
					startDate: '2026-03-01',
					endDate: '2026-03-03'
				})
			],
			[
				{ id: 'group-a', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 },
				{ id: 'group-b', name: 'Bravo', sortOrder: 1, parentId: null, depth: 1 },
				{ id: 'group-empty', name: 'Empty', sortOrder: 2, parentId: null, depth: 1 }
			],
			new Set(['group-a', 'group-empty']),
			'2026-03-01',
			'2026-04-29'
		);

		expect(result.dates).toHaveLength(60);
		expect(result.dates.slice(0, 3)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
		expect(result.groups.map((group) => group.groupId)).toEqual(['group-a', 'group-empty']);
		expect(result.groups[0].cells.slice(0, 3)).toEqual([
			{ date: '2026-03-01', totalPersonnel: 2, availableCount: 1, availablePercent: 50 },
			{ date: '2026-03-02', totalPersonnel: 2, availableCount: 1, availablePercent: 50 },
			{ date: '2026-03-03', totalPersonnel: 2, availableCount: 1, availablePercent: 50 }
		]);
		expect(result.groups[0].cells.at(-1)).toEqual({
			date: '2026-04-29',
			totalPersonnel: 2,
			availableCount: 1,
			availablePercent: 50
		});
		expect(result.groups[1].cells.slice(0, 3)).toEqual([
			{ date: '2026-03-01', totalPersonnel: 0, availableCount: 0, availablePercent: 100 },
			{ date: '2026-03-02', totalPersonnel: 0, availableCount: 0, availablePercent: 100 },
			{ date: '2026-03-03', totalPersonnel: 0, availableCount: 0, availablePercent: 100 }
		]);
		expect(result.groups[1].cells.at(-1)).toEqual({
			date: '2026-04-29',
			totalPersonnel: 0,
			availableCount: 0,
			availablePercent: 100
		});
	});
});

describe('report columns follow the catalog order', () => {
	const catalog: StatusType[] = [
		...statusTypes,
		{
			id: 'medical',
			name: 'Medical',
			color: '#dc2626',
			textColor: '#ffffff',
			shortLabel: null,
			rosterEffect: 'A',
			sortOrder: 2
		}
	];
	const reverseCatalogEntries = [
		availability({ id: 'medical-1', statusTypeId: 'medical', startDate: '2026-03-01', endDate: '2026-03-01' }),
		availability({ id: 'school-1', statusTypeId: 'school', startDate: '2026-03-02', endDate: '2026-03-02' }),
		availability({ id: 'leave-1', statusTypeId: 'leave', startDate: '2026-03-03', endDate: '2026-03-03' })
	];

	it('orders Status days columns by status type catalog, not entry arrival', () => {
		const result = computeStatusDays([person({})], reverseCatalogEntries, catalog, '2026-03-01', '2026-03-31');

		expect(result.activeStatusTypeIds).toEqual(['leave', 'school', 'medical']);
	});

	it('orders Personnel tempo columns by status type catalog, not entry arrival', () => {
		const result = computePersonnelTempo(
			[person({})],
			reverseCatalogEntries,
			catalog,
			new Set(['medical', 'leave']),
			'2026-03-01',
			'2026-03-31',
			90
		);

		expect(result.activeStatusTypeIds).toEqual(['leave', 'medical']);
	});

	it('orders Assignment coverage columns by assignment type catalog, not assignment arrival', () => {
		const assignmentTypes: AssignmentType[] = ['staff-duty', 'cq', 'guard'].map((id) => ({
			id,
			name: id,
			shortName: id,
			assignTo: 'personnel',
			color: '#2563eb',
			poolRules: null,
			weekendMode: 'same',
			excusals: [],
			showOnCalendar: false,
			sortOrder: 0
		}));
		const result = computeAssignmentCoverage(
			[person({})],
			[
				{ id: 'a-1', date: '2026-03-01', assignmentTypeId: 'guard', assigneeId: 'person-1' },
				{ id: 'a-2', date: '2026-03-02', assignmentTypeId: 'staff-duty', assigneeId: 'person-1' }
			],
			assignmentTypes,
			new Set(['staff-duty', 'cq', 'guard']),
			'2026-03-01',
			'2026-03-31'
		);

		expect(result.activeAssignmentTypeIds).toEqual(['staff-duty', 'guard']);
	});
});

describe('computeGroupReadiness sub-groups', () => {
	const group = (id: string, name: string, parentId: string | null, depth: 1 | 2 | 3, sortOrder = 0): Group => ({
		id,
		name,
		sortOrder,
		parentId,
		depth
	});
	const platoon = group('plt', '1st Platoon', null, 1, 0);
	const squad1 = group('sq1', '1st Squad', 'plt', 2, 0);
	const alpha = group('ta', 'Alpha Team', 'sq1', 3, 0);
	const bravo = group('tb', 'Bravo Team', 'sq1', 3, 1);
	const squad2 = group('sq2', '2nd Squad', 'plt', 2, 1);
	const section = group('hq', 'HQ Section', null, 1, 1);
	const catalog = [platoon, squad1, alpha, bravo, squad2, section];
	const members: [string, Group | null][] = [
		['p1', platoon],
		['p2', platoon],
		['s1', squad1],
		['t1', alpha],
		['t2', alpha],
		['t3', alpha],
		['b1', bravo],
		['b2', bravo],
		['q1', squad2],
		['q2', squad2],
		['h1', section],
		['h2', section],
		['h3', section],
		['u1', null]
	];
	const personnel = members.map(([id, home]) => person({ id, groupId: home?.id ?? null, groupName: home?.name ?? '' }));
	const away = ['p1', 't1', 'q1', 'h1'].map((personnelId) =>
		availability({ id: `out-${personnelId}`, personnelId, startDate: '2026-03-02', endDate: '2026-03-02' })
	);

	function readiness(groups: Group[], selected: string[], scoped: Personnel[] = personnel) {
		const result = computeGroupReadiness(scoped, away, groups, new Set(selected), '2026-03-02', '2026-03-02');
		const line = (row: (typeof result.groups)[number]) => [
			row.groupName,
			row.level,
			row.subtotal,
			`${row.cells[0].availableCount}/${row.cells[0].totalPersonnel}`
		];
		return {
			on: result.sets.flatMap((set) => [set.top, ...set.below]).map(line),
			off: result.sets.map((set) => line(set.top)),
			exported: result.groups.map(line)
		};
	}

	it('gives each selected top-level Group its subtree, HQ and sub-group rows, summing both ways', () => {
		const result = readiness(catalog, ['plt', 'hq']);

		expect(result.on).toEqual([
			['1st Platoon', 0, true, '7/10'],
			['1st Platoon HQ', 1, false, '1/2'],
			['1st Squad', 1, true, '5/6'],
			['1st Squad HQ', 2, false, '1/1'],
			['Alpha Team', 2, false, '2/3'],
			['Bravo Team', 2, false, '2/2'],
			['2nd Squad', 1, false, '1/2'],
			['HQ Section', 0, false, '2/3']
		]);
		expect(result.off).toEqual([
			['1st Platoon', 0, true, '7/10'],
			['HQ Section', 0, false, '2/3']
		]);
		const leaves = result.on.filter((row) => row[2] === false).map((row) => String(row[3]).split('/').map(Number));
		expect(leaves.reduce((sum, [available, total]) => [sum[0] + available, sum[1] + total], [0, 0])).toEqual([9, 13]);
	});

	it('keeps the per-Group rows the workbook writes', () => {
		expect(readiness(catalog, ['plt', 'hq']).exported).toEqual([
			['1st Platoon', 0, false, '1/2'],
			['1st Squad', 1, false, '1/1'],
			['Alpha Team', 2, false, '2/3'],
			['Bravo Team', 2, false, '2/2'],
			['2nd Squad', 1, false, '1/2'],
			['HQ Section', 0, false, '2/3']
		]);
	});

	it('gives a squad leader their teams on and one squad row off', () => {
		const result = readiness([squad1, alpha, bravo], ['sq1'], personnel.slice(2, 8));

		expect(result.on).toEqual([
			['1st Squad', 0, true, '5/6'],
			['1st Squad HQ', 1, false, '1/1'],
			['Alpha Team', 1, false, '2/3'],
			['Bravo Team', 1, false, '2/2']
		]);
		expect(result.off).toEqual([['1st Squad', 0, true, '5/6']]);
	});

	it('gives a team leader one row either way', () => {
		const result = readiness([alpha], ['ta'], personnel.slice(3, 6));

		expect(result.on).toEqual([['Alpha Team', 0, false, '2/3']]);
		expect(result.off).toEqual([['Alpha Team', 0, false, '2/3']]);
	});
});

describe('readinessTone', () => {
	const cell = (availableCount: number, totalPersonnel: number) => ({
		date: '2026-03-02',
		totalPersonnel,
		availableCount,
		availablePercent: Math.round((availableCount * 100) / totalPersonnel)
	});

	it('turns amber at 159 of 200, which shows as 80%, and stays green at 160', () => {
		expect([cell(159, 200).availablePercent, readinessTone(cell(159, 200))]).toEqual([80, 'warning']);
		expect(readinessTone(cell(160, 200))).toBe('success');
	});

	it('turns red at 99 of 200, which shows as 50%, and stays amber at 100', () => {
		expect([cell(99, 200).availablePercent, readinessTone(cell(99, 200))]).toEqual([50, 'destructive']);
		expect(readinessTone(cell(100, 200))).toBe('warning');
	});

	it('reads an empty Group as fully available', () => {
		expect(readinessTone({ date: '2026-03-02', totalPersonnel: 0, availableCount: 0, availablePercent: 100 })).toBe(
			'success'
		);
	});
});

import { describe, expect, it } from 'vitest';
import type { Personnel } from './personnel.types';
import { rosterExportFilename, rosterExportRows } from './rosterExport';
import { NESTED_GROUPS } from '$lib/test-support/nestedGroups';
import { buildPersonSignalCore, type RosterStatusType, type SignalRow } from './rosterSignals';

const groups = [{ id: 'group-1', name: '1st Squad', sortOrder: 0, parentId: null, depth: 1 as const }];

const LEAVE: RosterStatusType = { id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#fff', sortOrder: 0 };

function person(id: string, overrides: Partial<Personnel> = {}): Personnel {
	return {
		id,
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'Jane',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'group-1',
		groupName: '1st Squad',
		archivedAt: null,
		ets: '2027-03-01',
		deros: null,
		slug: id,
		...overrides
	};
}

function ready(away: boolean, overdueFollowUps: number): SignalRow {
	const core = buildPersonSignalCore({
		personnelId: 'x',
		asOf: '2026-10-23',
		today: { kind: 'known', value: away ? { kind: 'away', statusTypeId: 'leave' } : { kind: 'present' } },
		training: { ok: true, value: { items: [] } },
		criticalTasks: { ok: true, value: { items: [] } },
		evaluation: { ok: true, value: null },
		openFollowUps: {
			kind: 'known',
			value: Array.from({ length: overdueFollowUps }, (_, index) => ({
				id: `f-${index}`,
				title: 'Call',
				dueDate: '2026-10-01'
			}))
		},
		counselingDates: { kind: 'known', value: ['2026-10-23'] }
	});
	return { kind: 'ready', value: { ...core, loss: null } };
}

describe('rosterExportRows', () => {
	it('writes nested Group paths from the supplied catalog', () => {
		const rows = rosterExportRows([person('p-1', { groupId: 'alpha' })], () => ready(false, 0), [LEAVE], NESTED_GROUPS);
		expect(rows[0].group).toBe('1st Platoon / 2nd Squad / Alpha Team');
	});
	it('writes one row per Person with the roster’s Today and Needs attention', () => {
		const signals = new Map<string, SignalRow>([
			['p-1', ready(false, 2)],
			['p-2', ready(true, 0)]
		]);
		const rows = rosterExportRows(
			[
				person('p-1'),
				person('p-2', { rank: 'SPC', lastName: 'Diaz', firstName: 'Ana', ets: null, deros: '2027-06-15' })
			],
			(row) => signals.get(row.id)!,
			[LEAVE],
			groups
		);

		expect(rows).toEqual([
			{
				rank: 'SGT',
				lastName: 'Smith',
				firstName: 'Jane',
				mos: '68W',
				role: 'Medic',
				group: '1st Squad',
				ets: '2027-03-01',
				deros: '',
				today: 'Present',
				attention: '2 follow-ups overdue'
			},
			{
				rank: 'SPC',
				lastName: 'Diaz',
				firstName: 'Ana',
				mos: '68W',
				role: 'Medic',
				group: '1st Squad',
				ets: '',
				deros: '2027-06-15',
				today: 'Leave',
				attention: 'None'
			}
		]);
	});

	it('leaves Today and Needs attention blank while the signals load or after they fail', () => {
		const [pending] = rosterExportRows([person('p-1')], () => ({ kind: 'pending' }), [LEAVE], groups);
		const [failed] = rosterExportRows([person('p-1')], () => ({ kind: 'failed' }), [LEAVE], groups);

		expect([pending.today, pending.attention, failed.today, failed.attention]).toEqual(['', '', '', '']);
	});
});

describe('rosterExportFilename', () => {
	it('names the Organization and the viewer’s day', () => {
		expect(rosterExportFilename('c-co-2-501', '2026-10-23')).toBe('personnel-c-co-2-501-2026-10-23.xlsx');
	});
});

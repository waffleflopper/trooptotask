import { describe, expect, it } from 'vitest';
import type { AssignmentType, AvailabilityEntry } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { DashboardInputs } from './dashboardInputs';
import { comingAndGoing, tonightAndTomorrow } from './onDuty';

function person(id: string, rank: string, lastName: string): Personnel {
	return { id, rank, lastName, firstName: 'A', mos: '68W', clinicRole: '', groupId: 'alpha', groupName: 'Alpha' };
}

function lane(id: string, name: string, overrides: Partial<AssignmentType> = {}): AssignmentType {
	return {
		id,
		name,
		shortName: name.slice(0, 2),
		assignTo: 'personnel',
		color: '#1f6feb',
		poolRules: null,
		weekendMode: 'same',
		excusals: [],
		showOnCalendar: true,
		sortOrder: 0,
		...overrides
	};
}

function entry(id: string, personnelId: string, startDate: string, endDate: string): AvailabilityEntry {
	return { id, personnelId, statusTypeId: 'leave', startDate, endDate } as AvailabilityEntry;
}

function inputs(loaded: Partial<DashboardInputs>): DashboardInputs {
	return {
		today: '2026-10-19',
		timeZone: 'UTC',
		forecastDays: [],
		personnel: [person('p-okafor', 'SSG', 'Okafor'), person('p-liang', 'SPC', 'Liang')],
		availability: [],
		statusTypes: [
			{
				id: 'leave',
				name: 'Leave',
				color: '#336699',
				textColor: '#ffffff',
				shortLabel: null,
				rosterEffect: 'available',
				sortOrder: 0
			}
		],
		groups: [{ id: 'alpha', name: 'Alpha Platoon', sortOrder: 0 }],
		specialDays: [],
		assignmentTypes: [],
		assignments: [],
		page: {} as DashboardInputs['page'],
		...loaded
	};
}

describe('tonightAndTomorrow', () => {
	it('names each Calendar lane in lane order with today and tomorrow, including a tomorrow-only duty', () => {
		const rows = tonightAndTomorrow(
			inputs({
				assignmentTypes: [
					lane('cq', 'CQ', { sortOrder: 1 }),
					lane('staff-duty', 'Staff Duty', { sortOrder: 0 }),
					lane('clinic', 'Clinic Coverage', { sortOrder: 2, assignTo: 'group', color: '#2da44e' }),
					lane('hidden', 'Hidden', { showOnCalendar: false })
				],
				assignments: [
					{ id: 'a1', date: '2026-10-20', assignmentTypeId: 'staff-duty', assigneeId: 'p-okafor' },
					{ id: 'a2', date: '2026-10-19', assignmentTypeId: 'cq', assigneeId: 'p-liang' },
					{ id: 'a3', date: '2026-10-19', assignmentTypeId: 'clinic', assigneeId: 'alpha' },
					{ id: 'a4', date: '2026-10-21', assignmentTypeId: 'cq', assigneeId: 'p-okafor' }
				]
			})
		);

		expect(rows).toEqual([
			{ assignmentTypeId: 'staff-duty', name: 'Staff Duty', color: '#1f6feb', today: null, tomorrow: 'SSG Okafor' },
			{ assignmentTypeId: 'cq', name: 'CQ', color: '#1f6feb', today: 'SPC Liang', tomorrow: null },
			{ assignmentTypeId: 'clinic', name: 'Clinic Coverage', color: '#2da44e', today: 'Alpha Platoon', tomorrow: null }
		]);
	});
});

describe('comingAndGoing', () => {
	it('lists departures and returns inside the window soonest first, returning the day after a status ends', () => {
		const changes = comingAndGoing(
			inputs({
				availability: [
					entry('leave-okafor', 'p-okafor', '2026-10-21', '2026-10-23'),
					entry('leave-liang', 'p-liang', '2026-10-10', '2026-10-19'),
					entry('later', 'p-liang', '2026-10-27', '2026-10-30')
				]
			}),
			7
		);

		expect(changes).toEqual([
			{
				id: 'leave-liang:returning',
				date: '2026-10-20',
				direction: 'returning',
				personName: 'SPC Liang',
				label: 'Returning'
			},
			{
				id: 'leave-okafor:leaving',
				date: '2026-10-21',
				direction: 'leaving',
				personName: 'SSG Okafor',
				label: 'Leave'
			},
			{
				id: 'leave-okafor:returning',
				date: '2026-10-24',
				direction: 'returning',
				personName: 'SSG Okafor',
				label: 'Returning'
			}
		]);
	});

	it('treats back-to-back statuses as one absence, back on the first uncovered day', () => {
		const changes = comingAndGoing(
			inputs({
				availability: [
					entry('leave', 'p-okafor', '2026-10-12', '2026-10-19'),
					entry('tdy', 'p-okafor', '2026-10-20', '2026-10-22'),
					entry('leave-liang', 'p-liang', '2026-10-21', '2026-10-22'),
					entry('tdy-liang', 'p-liang', '2026-10-23', '2026-10-24')
				]
			}),
			7
		);

		expect(changes.map(({ id, date, label }) => [id, date, label])).toEqual([
			['leave-liang:leaving', '2026-10-21', 'Leave'],
			['leave:returning', '2026-10-23', 'Returning'],
			['leave-liang:returning', '2026-10-25', 'Returning']
		]);
	});

	it('returns a Person once when two overlapping statuses end on the same day', () => {
		const changes = comingAndGoing(
			inputs({
				availability: [
					entry('leave', 'p-okafor', '2026-10-15', '2026-10-20'),
					entry('appointment', 'p-okafor', '2026-10-18', '2026-10-20')
				]
			}),
			7
		);

		expect(changes.map(({ id, date }) => [id, date])).toEqual([['leave:returning', '2026-10-21']]);
	});

	it('leaves out a Person outside the roster', () => {
		expect(comingAndGoing(inputs({ availability: [entry('x', 'p-bravo', '2026-10-21', '2026-10-22')] }), 7)).toEqual(
			[]
		);
	});
});

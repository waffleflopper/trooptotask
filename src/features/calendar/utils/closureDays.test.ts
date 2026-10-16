import { describe, expect, it } from 'vitest';
import type { SpecialDay } from '$features/calendar/contracts';
import { closureDates, closureListView, partitionClosureDates } from './closureDays';

const closure = (date: string, name = 'Block leave'): SpecialDay => ({
	id: `c-${date}`,
	date,
	name,
	type: 'org-closure'
});
const federal = (date: string, name: string): SpecialDay => ({ id: `f-${date}`, date, name, type: 'federal-holiday' });

describe('closureDates', () => {
	it('drops Saturdays and Sundays from a skip-weekends range', () => {
		expect(closureDates({ startDate: '2026-12-18', endDate: '2026-12-22', skipWeekends: true })).toEqual({
			ok: true,
			dates: ['2026-12-18', '2026-12-21', '2026-12-22']
		});
	});

	it('keeps weekend days when skipping is off', () => {
		expect(closureDates({ startDate: '2026-12-18', endDate: '2026-12-21', skipWeekends: false })).toEqual({
			ok: true,
			dates: ['2026-12-18', '2026-12-19', '2026-12-20', '2026-12-21']
		});
	});

	it('gives a single weekday as one date when start and end match', () => {
		expect(closureDates({ startDate: '2026-10-09', endDate: '2026-10-09', skipWeekends: true })).toEqual({
			ok: true,
			dates: ['2026-10-09']
		});
	});

	it('gives no dates for a single weekend day when skipping is on', () => {
		expect(closureDates({ startDate: '2026-03-08', endDate: '2026-03-08', skipWeekends: true })).toEqual({
			ok: true,
			dates: []
		});
	});

	it('crosses a year boundary and a leap day', () => {
		expect(closureDates({ startDate: '2026-12-30', endDate: '2027-01-04', skipWeekends: true })).toEqual({
			ok: true,
			dates: ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-04']
		});
		expect(closureDates({ startDate: '2024-02-28', endDate: '2024-03-01', skipWeekends: false })).toEqual({
			ok: true,
			dates: ['2024-02-28', '2024-02-29', '2024-03-01']
		});
	});

	it('rejects a missing day, an end before the start and more than 366 dates', () => {
		expect(closureDates({ startDate: '2026-10-09', endDate: '', skipWeekends: true })).toEqual({
			ok: false,
			reason: 'missing-date'
		});
		expect(closureDates({ startDate: '', endDate: '2026-10-09', skipWeekends: true })).toEqual({
			ok: false,
			reason: 'missing-date'
		});
		expect(closureDates({ startDate: '2026-10-09', endDate: '2026-10-08', skipWeekends: false })).toEqual({
			ok: false,
			reason: 'end-before-start'
		});
		expect(closureDates({ startDate: '2028-01-01', endDate: '2028-12-31', skipWeekends: false })).toMatchObject({
			ok: true,
			dates: { length: 366 }
		});
		expect(closureDates({ startDate: '2027-01-01', endDate: '2028-01-02', skipWeekends: false })).toEqual({
			ok: false,
			reason: 'too-many-days'
		});
	});
});

describe('partitionClosureDates', () => {
	it('skips dates that already hold a holiday or a closure', () => {
		expect(
			partitionClosureDates(
				['2026-12-23', '2026-12-24', '2026-12-25', '2026-12-28'],
				[federal('2026-12-25', 'Christmas Day'), closure('2026-12-28', 'Stand-down')]
			)
		).toEqual({ create: ['2026-12-23', '2026-12-24'], skip: ['2026-12-25', '2026-12-28'] });
	});
});

describe('closureListView', () => {
	const FUTURE_TODAY = '2025-06-01';

	it('merges a skip-weekends block leave over two weeks into one range row', () => {
		const leave = ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11', '2026-12-14', '2026-12-15'];
		const view = closureListView(
			leave.map((date) => closure(date)),
			2026,
			FUTURE_TODAY
		);

		expect(view).toEqual({
			past: null,
			months: [{ month: 11, rows: [{ kind: 'range', name: 'Block leave', days: leave.map((date) => closure(date)) }] }]
		});
	});

	it('splits a same-name run at a weekday gap and keeps different names apart', () => {
		const days = [
			closure('2026-12-21'),
			closure('2026-12-22'),
			closure('2026-12-24'),
			closure('2026-12-23', 'Holiday party')
		];
		const rows = closureListView(days, 2026, FUTURE_TODAY).months[0].rows;

		expect(rows).toEqual([
			{ kind: 'range', name: 'Block leave', days: [closure('2026-12-21'), closure('2026-12-22')] },
			{ kind: 'day', day: closure('2026-12-23', 'Holiday party') },
			{ kind: 'day', day: closure('2026-12-24') }
		]);
	});

	it('never merges federal holidays', () => {
		const days = [federal('2026-11-26', 'Thanksgiving Day'), federal('2026-11-27', 'Thanksgiving Day')];

		expect(closureListView(days, 2026, FUTURE_TODAY).months).toEqual([
			{ month: 10, rows: days.map((day) => ({ kind: 'day', day })) }
		]);
	});

	it('splits a range at a month boundary so each month shows its own part', () => {
		const days = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map((date) => closure(date, 'Training week'));

		expect(closureListView(days, 2026, FUTURE_TODAY).months).toEqual([
			{ month: 8, rows: [{ kind: 'range', name: 'Training week', days: days.slice(0, 2) }] },
			{ month: 9, rows: [{ kind: 'range', name: 'Training week', days: days.slice(2) }] }
		]);
	});

	it('keeps the current-month part of a cross-month range out of the collapsed past', () => {
		const days = ['2026-09-30', '2026-10-01'].map((date) => closure(date, 'Training week'));

		expect(closureListView(days, 2026, '2026-10-16')).toEqual({
			past: { throughMonth: 8, dayCount: 1, months: [{ month: 8, rows: [{ kind: 'day', day: days[0] }] }] },
			months: [{ month: 9, rows: [{ kind: 'day', day: days[1] }] }]
		});
	});

	it('collapses months before the current month and counts their days', () => {
		const days = [
			federal('2026-01-01', "New Year's Day"),
			closure('2026-03-09', 'Spring stand-down'),
			closure('2026-03-10', 'Spring stand-down'),
			closure('2026-10-09', 'Training holiday'),
			federal('2026-10-12', 'Columbus Day')
		];

		const view = closureListView(days, 2026, '2026-10-16');

		expect(view.past).toEqual({
			throughMonth: 8,
			dayCount: 3,
			months: [
				{ month: 0, rows: [{ kind: 'day', day: federal('2026-01-01', "New Year's Day") }] },
				{
					month: 2,
					rows: [
						{
							kind: 'range',
							name: 'Spring stand-down',
							days: [closure('2026-03-09', 'Spring stand-down'), closure('2026-03-10', 'Spring stand-down')]
						}
					]
				}
			]
		});
		expect(view.months.map(({ month }) => month)).toEqual([9]);
	});

	it('collapses a past year entirely and nothing in a future year', () => {
		const days = [federal('2025-01-01', "New Year's Day"), closure('2025-12-26', 'Holiday leave')];
		expect(closureListView(days, 2025, '2026-10-16')).toMatchObject({
			past: { throughMonth: 11, dayCount: 2 },
			months: []
		});
		expect(closureListView(days, 2025, '2024-10-16')).toMatchObject({
			past: null,
			months: [{ month: 0 }, { month: 11 }]
		});
	});
});

import { describe, expect, it } from 'vitest';
import {
	fitMarkers,
	layoutBars,
	shortRangeLabel,
	type AvailabilitySpan,
	type BarEntry,
	type BarStatus,
	type LabelPolicy
} from './bar-layout';
import { dayWindow, toDayNumber } from '$lib/utils/dayNumber';

const status = (name: string, shortLabel: string | null = null): BarStatus => ({
	name,
	color: '#16a34a',
	textColor: '#ffffff',
	shortLabel
});

const leave = status('Leave');
const sick = status('Sick');
const appointment = status('Appointment', 'APT');
const tdy = status('TDY');
const school = status('School');

function span(id: string, kind: BarStatus, startDate: string, endDate: string, note: string | null = null) {
	const entry: BarEntry = { id, note };
	return { entry, status: kind, start: toDayNumber(startDate), end: toDayNumber(endDate) } satisfies AvailabilitySpan;
}

const oct19To28 = dayWindow('2026-10-19', 10);
const month: LabelPolicy = { view: 'month', showStatusText: false };

function placements(spans: AvailabilitySpan[], window = oct19To28, policy: LabelPolicy = month) {
	const layout = layoutBars(spans, window, policy);
	return {
		bars: layout.bars.map((bar) => ({
			id: bar.entry.id,
			start: bar.start,
			end: bar.end,
			lane: bar.lane,
			before: bar.continuesBefore,
			after: bar.continuesAfter,
			label: bar.label
		})),
		overflows: layout.overflows.map((overflow) => ({
			start: overflow.start,
			end: overflow.end,
			ids: overflow.spans.map((item) => item.entry.id),
			description: overflow.description
		}))
	};
}

describe('layoutBars in the month view', () => {
	it('labels a one-day entry with its one-day label', () => {
		expect(placements([span('apt', appointment, '2026-10-20', '2026-10-20')]).bars).toEqual([
			{
				id: 'apt',
				start: 1,
				end: 1,
				lane: 'full',
				before: false,
				after: false,
				label: { kind: 'one-day', text: 'APT' }
			}
		]);
	});

	it('labels a two-day entry with the status name only', () => {
		expect(placements([span('sick', sick, '2026-10-21', '2026-10-22', 'Flu')]).bars[0]?.label).toEqual({
			kind: 'name',
			text: 'Sick'
		});
	});

	it('adds the note from four visible days', () => {
		expect(
			placements([
				span('three', leave, '2026-10-19', '2026-10-21', 'Block leave'),
				span('four', leave, '2026-10-23', '2026-10-26', 'Block leave')
			]).bars.map((bar) => bar.label)
		).toEqual([
			{ kind: 'name', text: 'Leave' },
			{ kind: 'name-note', name: 'Leave', note: 'Block leave' }
		]);
	});

	it('shows the longest label on every bar when status text is preferred', () => {
		const showStatusText: LabelPolicy = { view: 'month', showStatusText: true };
		expect(
			placements(
				[
					span('apt', appointment, '2026-10-20', '2026-10-20', 'Dental'),
					span('sick', sick, '2026-10-22', '2026-10-22')
				],
				oct19To28,
				showStatusText
			).bars.map((bar) => bar.label)
		).toEqual([
			{ kind: 'name-note', name: 'Appointment', note: 'Dental' },
			{ kind: 'name', text: 'Sick' }
		]);
	});

	it('splits overlapping entries into two lanes and leaves an unrelated entry full height', () => {
		expect(
			placements([
				span('apt', appointment, '2026-10-21', '2026-10-21'),
				span('tdy', tdy, '2026-10-19', '2026-10-23', 'JRTC prep'),
				span('school', school, '2026-10-26', '2026-10-27')
			]).bars
		).toEqual([
			{
				id: 'tdy',
				start: 0,
				end: 4,
				lane: 'top',
				before: false,
				after: false,
				label: { kind: 'name-note', name: 'TDY', note: 'JRTC prep' }
			},
			{
				id: 'apt',
				start: 2,
				end: 2,
				lane: 'bottom',
				before: false,
				after: false,
				label: { kind: 'one-day', text: 'APT' }
			},
			{
				id: 'school',
				start: 7,
				end: 8,
				lane: 'full',
				before: false,
				after: false,
				label: { kind: 'name', text: 'School' }
			}
		]);
	});

	it('squares the clipped end of an entry that runs past either edge of the window', () => {
		expect(
			placements([
				span('school', school, '2026-10-26', '2026-11-03'),
				span('leave', leave, '2026-10-10', '2026-10-20', 'Block leave')
			]).bars
		).toEqual([
			{
				id: 'leave',
				start: 0,
				end: 1,
				lane: 'full',
				before: true,
				after: false,
				label: { kind: 'name', text: 'Leave' }
			},
			{
				id: 'school',
				start: 7,
				end: 9,
				lane: 'full',
				before: false,
				after: true,
				label: { kind: 'name', text: 'School' }
			}
		]);
	});

	it('keeps entries that only touch on consecutive days as separate full bars', () => {
		expect(
			placements([span('a', leave, '2026-10-19', '2026-10-21'), span('b', sick, '2026-10-22', '2026-10-23')]).bars.map(
				(bar) => [bar.id, bar.lane]
			)
		).toEqual([
			['a', 'full'],
			['b', 'full']
		]);
	});

	it('draws nothing for an entry outside the window', () => {
		expect(placements([span('later', leave, '2026-10-29', '2026-11-02')])).toEqual({ bars: [], overflows: [] });
	});

	it('gives an entry the full track in a month where its overlap is out of view', () => {
		const spans = [span('a', leave, '2026-01-28', '2026-02-03'), span('b', sick, '2026-01-25', '2026-01-30')];

		expect(placements(spans, dayWindow('2026-02-01', 28)).bars.map((bar) => [bar.id, bar.lane])).toEqual([
			['a', 'full']
		]);
		expect(placements(spans, dayWindow('2026-01-01', 31)).bars.map((bar) => [bar.id, bar.lane])).toEqual([
			['b', 'top'],
			['a', 'bottom']
		]);
	});

	it('summarizes every entry beyond the first lane when a cluster needs a third lane', () => {
		const result = placements(
			[
				span('a', leave, '2026-10-01', '2026-10-08'),
				span('b', sick, '2026-10-03', '2026-10-06'),
				span('c', appointment, '2026-10-04', '2026-10-05')
			],
			dayWindow('2026-10-01', 31)
		);

		expect(result.bars.map((bar) => [bar.id, bar.lane, bar.start, bar.end])).toEqual([['a', 'top', 0, 7]]);
		expect(result.overflows).toEqual([
			{ start: 2, end: 5, ids: ['b', 'c'], description: '2 more entries, 3 to 6 October 2026' }
		]);
	});

	it('keeps first-lane bars of a chain separate from the summary', () => {
		const result = placements(
			[
				span('a', leave, '2026-10-01', '2026-10-03'),
				span('b', sick, '2026-10-02', '2026-10-10'),
				span('c', tdy, '2026-10-02', '2026-10-04'),
				span('d', appointment, '2026-10-05', '2026-10-06')
			],
			dayWindow('2026-10-01', 31)
		);

		expect(result.bars.map((bar) => [bar.id, bar.lane, bar.start, bar.end])).toEqual([
			['a', 'top', 0, 2],
			['d', 'top', 4, 5]
		]);
		expect(result.overflows.map((overflow) => [overflow.ids, overflow.start, overflow.end])).toEqual([
			[['b', 'c'], 1, 9]
		]);
	});

	it('summarizes only the run of lower entries that needs a third lane', () => {
		const result = placements(
			[
				span('a', leave, '2026-10-01', '2026-10-31'),
				span('b', sick, '2026-10-02', '2026-10-04'),
				span('c', appointment, '2026-10-03', '2026-10-05'),
				span('d', tdy, '2026-10-11', '2026-10-13'),
				span('e', school, '2026-10-21', '2026-10-23')
			],
			dayWindow('2026-10-01', 31)
		);

		expect(result.bars.map((bar) => [bar.id, bar.lane, bar.start, bar.end])).toEqual([
			['a', 'top', 0, 30],
			['d', 'bottom', 10, 12],
			['e', 'bottom', 20, 22]
		]);
		expect(result.overflows).toEqual([
			{ start: 1, end: 4, ids: ['b', 'c'], description: '2 more entries, 2 to 5 October 2026' }
		]);
	});

	it('describes an entry completely for its accessible name', () => {
		const layout = layoutBars(
			[
				span('leave', leave, '2026-10-20', '2026-10-23', 'Block leave'),
				span('school', school, '2026-10-26', '2026-11-03')
			],
			oct19To28,
			month
		);

		expect(layout.bars.map((bar) => bar.description)).toEqual([
			'Leave, 20 to 23 October 2026, 4 days, Block leave',
			'School, 26 October to 3 November 2026, 9 days'
		]);
	});
});

describe('layoutBars in the 3-Month view', () => {
	const quarter = dayWindow('2026-10-01', 92);
	const tenPx: LabelPolicy = { view: '3-month', dayPx: 10 };

	it('fits the longest label that the bar width allows', () => {
		expect(
			placements(
				[
					span('leave', leave, '2026-10-01', '2026-10-09'),
					span('apt', appointment, '2026-10-12', '2026-10-17'),
					span('school', school, '2026-10-19', '2026-10-21'),
					span('one', appointment, '2026-10-23', '2026-10-23')
				],
				quarter,
				tenPx
			).bars.map((bar) => bar.label)
		).toEqual([
			{ kind: 'with-length', text: 'Leave', days: 9 },
			{ kind: 'with-length', text: 'APT', days: 6 },
			{ kind: 'one-day', text: 'SCH' },
			{ kind: 'none' }
		]);
	});

	it('counts the whole entry in the length while sizing the label to the visible days', () => {
		expect(
			placements([span('leave', leave, '2026-09-29', '2026-10-07')], quarter, tenPx).bars.map((bar) => [
				bar.end,
				bar.label
			])
		).toEqual([[6, { kind: 'with-length', text: 'LEA', days: 9 }]]);
		expect(
			placements([span('leave', leave, '2026-09-30', '2026-10-08')], quarter, tenPx).bars.map((bar) => [
				bar.end,
				bar.label
			])
		).toEqual([[7, { kind: 'with-length', text: 'Leave', days: 9 }]]);
	});
});

describe('fitMarkers', () => {
	const lanes = (fit: ReturnType<typeof fitMarkers>) => fit.layout.bars.map((bar) => [bar.entry.id, bar.lane]);

	it('raises a full bar to the top lane under a marked day and leaves other bars full', () => {
		const layout = layoutBars(
			[span('leave', leave, '2026-10-20', '2026-10-23'), span('school', school, '2026-10-26', '2026-10-27')],
			oct19To28,
			month
		);

		const fit = fitMarkers(layout, [2]);

		expect(lanes(fit)).toEqual([
			['leave', 'top'],
			['school', 'full']
		]);
		expect(fit.markers).toEqual([{ day: 2, shared: false }]);
	});

	it('keeps a marker whose day holds a lower bar or a summary, cutting that item around the marker', () => {
		const lower = fitMarkers(
			layoutBars(
				[span('tdy', tdy, '2026-10-20', '2026-10-24'), span('apt', appointment, '2026-10-21', '2026-10-21')],
				oct19To28,
				month
			),
			[4, 2]
		);
		expect(lower.markers).toEqual([
			{ day: 2, shared: true },
			{ day: 4, shared: false }
		]);
		expect(lower.layout.bars.map((bar) => [bar.entry.id, bar.lane, bar.pieces])).toEqual([
			['tdy', 'top', undefined],
			['apt', 'bottom', [{ start: 2, end: 2, yieldsEnd: true }]]
		]);

		const summarized = fitMarkers(
			layoutBars(
				[
					span('a', leave, '2026-10-19', '2026-10-26'),
					span('b', sick, '2026-10-21', '2026-10-24'),
					span('c', appointment, '2026-10-22', '2026-10-23')
				],
				oct19To28,
				month
			),
			[3, 7]
		);
		expect(summarized.markers).toEqual([
			{ day: 3, shared: true },
			{ day: 7, shared: false }
		]);
		expect(summarized.layout.bars.map((bar) => [bar.entry.id, bar.lane])).toEqual([['a', 'top']]);
		expect(
			summarized.layout.overflows.map((overflow) => [overflow.spans.map((item) => item.entry.id), overflow.pieces])
		).toEqual([
			[
				['b', 'c'],
				[
					{ start: 2, end: 3, yieldsEnd: true },
					{ start: 4, end: 5, yieldsEnd: false }
				]
			]
		]);
	});
});

describe('shortRangeLabel', () => {
	it('names the weekday and day of each end, with the month once when it is shared', () => {
		expect(shortRangeLabel(toDayNumber('2026-10-20'), toDayNumber('2026-10-23'))).toBe('Tue 20 – Fri 23 Oct');
		expect(shortRangeLabel(toDayNumber('2026-10-26'), toDayNumber('2026-11-03'))).toBe('Mon 26 Oct – Tue 3 Nov');
		expect(shortRangeLabel(toDayNumber('2026-10-21'), toDayNumber('2026-10-21'))).toBe('Wed 21 Oct');
	});
});

import { afterEach, describe, expect, it } from 'vitest';
import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import { buildAvailabilityTracks } from './availabilityTracks';
import { dayWindow, fromDayNumber, toDayNumber } from './dayNumber';

const leave: StatusType = {
	id: 'leave',
	name: 'Leave',
	color: '#16a34a',
	textColor: '#ffffff',
	shortLabel: null,
	sortOrder: 0
};

function entry(id: string, personnelId: string, startDate: string, endDate: string, statusTypeId = 'leave') {
	return { id, personnelId, statusTypeId, startDate, endDate, note: null } satisfies AvailabilityEntry;
}

describe('day numbers', () => {
	const originalTimezone = process.env.TZ;
	afterEach(() => {
		if (originalTimezone === undefined) delete process.env.TZ;
		else process.env.TZ = originalTimezone;
	});

	it('steps one day across the spring daylight-saving change', () => {
		process.env.TZ = 'America/Los_Angeles';

		expect(toDayNumber('2026-03-09') - toDayNumber('2026-03-08')).toBe(1);
		expect(fromDayNumber(toDayNumber('2026-03-08') + 1)).toBe('2026-03-09');
	});
});

describe('buildAvailabilityTracks', () => {
	it('groups entries by person in start order and drops entries whose status is gone', () => {
		const tracks = buildAvailabilityTracks(
			[
				entry('b', 'p1', '2026-10-05', '2026-10-06'),
				entry('c', 'p2', '2026-10-01', '2026-10-01'),
				entry('a', 'p1', '2026-10-05', '2026-10-09'),
				entry('z', 'p1', '2026-10-02', '2026-10-02'),
				entry('gone', 'p1', '2026-10-01', '2026-10-01', 'deleted-status')
			],
			[leave]
		);

		expect(tracks.spans('p1').map((span) => span.entry.id)).toEqual(['z', 'a', 'b']);
		expect(tracks.spans('p2').map((span) => span.entry.id)).toEqual(['c']);
		expect(tracks.spans('nobody')).toEqual([]);
	});

	it("reuses a person's layout for the same window and policy, and lays it out again when either changes", () => {
		const tracks = buildAvailabilityTracks([{ ...entry('a', 'p1', '2026-10-05', '2026-10-06'), note: 'Flu' }], [leave]);
		const october = dayWindow('2026-10-01', 31);
		const month = { view: 'month', showStatusText: false } as const;
		const placed = (layout: ReturnType<typeof tracks.layout>) =>
			layout.bars.map((bar) => [bar.start, bar.end, bar.label]);

		const first = tracks.layout('p1', october, month);

		expect(tracks.layout('p1', dayWindow('2026-10-01', 31), { view: 'month', showStatusText: false })).toBe(first);
		expect(placed(tracks.layout('p1', dayWindow('2026-10-03', 31), month))).toEqual([
			[2, 3, { kind: 'name', text: 'Leave' }]
		]);
		expect(placed(tracks.layout('p1', october, { view: '3-month', dayPx: 20 }))).toEqual([
			[4, 5, { kind: 'one-day', text: 'LEA' }]
		]);
		expect(placed(tracks.layout('p1', october, month))).toEqual([[4, 5, { kind: 'name', text: 'Leave' }]]);
		expect(placed(tracks.layout('p1', october, { view: 'month', showStatusText: true }))).toEqual([
			[4, 5, { kind: 'name-note', name: 'Leave', note: 'Flu' }]
		]);
		expect(placed(tracks.layout('p1', october, month))).toEqual([[4, 5, { kind: 'name', text: 'Leave' }]]);
	});

	it('counts each person out once per day, however many of their entries overlap', () => {
		const tracks = buildAvailabilityTracks(
			[
				entry('a1', 'p1', '2026-09-28', '2026-10-02'),
				entry('a2', 'p1', '2026-10-02', '2026-10-03'),
				entry('a3', 'p1', '2026-10-05', '2026-10-05'),
				entry('b1', 'p2', '2026-10-03', '2026-10-04'),
				entry('c1', 'p3', '2026-10-01', '2026-10-07')
			],
			[leave]
		);

		expect(tracks.outCounts(['p1', 'p2'], dayWindow('2026-10-01', 6))).toEqual([1, 1, 2, 1, 1, 0]);
	});
});

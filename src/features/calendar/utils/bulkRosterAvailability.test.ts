import { describe, expect, it } from 'vitest';
import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import { classifyBulkAddOverlaps } from './availabilityMutation';
import { AVAILABLE_ROW, projectBulkRosterAvailability, rosterAvailabilityRow } from './bulkRosterAvailability';

function status(id: string, name: string): StatusType {
	return { id, name, color: '#48bb78', textColor: '#ffffff', shortLabel: null, sortOrder: 0 };
}

const statusTypes = [status('leave', 'Leave'), status('sick', 'Sick')];

function entry(over: Partial<AvailabilityEntry> & { id: string }): AvailabilityEntry {
	return {
		personnelId: 'p1',
		statusTypeId: 'leave',
		startDate: '2026-10-26',
		note: null,
		...over,
		endDate: over.endDate ?? over.startDate ?? '2026-10-26'
	};
}

function project(entries: AvailabilityEntry[], range = { rangeStart: '2026-10-26', rangeEnd: '2026-10-28' }) {
	const overlaps = classifyBulkAddOverlaps({ entries, statusTypeId: 'leave', range });
	return projectBulkRosterAvailability({ overlaps, statusTypes, range });
}

describe('projectBulkRosterAvailability', () => {
	it('explains a blocked person with the original dates of the entry they are already on', () => {
		const result = project([entry({ id: 'a', personnelId: 'liang', startDate: '2026-10-26', endDate: '2026-10-31' })]);

		expect(rosterAvailabilityRow(result, 'liang')).toMatchObject({
			kind: 'already-on-status',
			blocked: true,
			hint: 'Already on Leave 26–31 Oct'
		});
	});

	it('names an other-status overlap as selectable and lists every entry', () => {
		const result = project([
			entry({ id: 'a', personnelId: 'ortiz', statusTypeId: 'sick', startDate: '2026-10-26' }),
			entry({ id: 'b', personnelId: 'ortiz', statusTypeId: 'sick', startDate: '2026-10-28', endDate: '2026-10-29' })
		]);

		expect(rosterAvailabilityRow(result, 'ortiz')).toMatchObject({
			kind: 'overlap',
			blocked: false,
			hint: 'Sick 26 Oct, Sick 28–29 Oct overlaps'
		});
	});

	it('names both kinds when a person has them, same status first', () => {
		const result = project([
			entry({ id: 'a', statusTypeId: 'sick', startDate: '2026-10-26' }),
			entry({ id: 'b', startDate: '2026-10-27' })
		]);

		expect(rosterAvailabilityRow(result, 'p1').hint).toBe('Already on Leave 27 Oct · Sick 26 Oct overlaps');
	});

	it('reads a person with no intersecting entry as available', () => {
		const result = project([entry({ id: 'a', startDate: '2026-10-20', endDate: '2026-10-25' })]);

		expect(rosterAvailabilityRow(result, 'p1')).toBe(AVAILABLE_ROW);
		expect(AVAILABLE_ROW).toMatchObject({ blocked: false, hint: null });
	});

	it('draws simultaneous statuses on the strip with the days the range covers', () => {
		const result = project([
			entry({ id: 'a', statusTypeId: 'sick', startDate: '2026-10-26', endDate: '2026-10-27' }),
			entry({ id: 'b', startDate: '2026-10-27', endDate: '2026-10-27' })
		]);

		const bars = rosterAvailabilityRow(result, 'p1').bars!;
		expect(bars.bars.map((bar) => [bar.entry.id, bar.start, bar.end, bar.lane])).toEqual([
			['a', 0, 1, 'top'],
			['b', 1, 1, 'bottom']
		]);
		expect(result.headings.map((heading) => [heading.weekday, heading.day])).toEqual([
			['M', 26],
			['T', 27],
			['W', 28]
		]);
	});

	it('clips a long entry to the strip days while the hint keeps its original dates', () => {
		const result = project([entry({ id: 'a', startDate: '2026-10-01', endDate: '2026-11-30' })]);

		const row = rosterAvailabilityRow(result, 'p1');
		expect(row.bars!.bars).toMatchObject([{ start: 0, end: 2, continuesBefore: true, continuesAfter: true }]);
		expect(row.hint).toBe('Already on Leave 1 Oct – 30 Nov');
	});

	it('draws every day of a 31-day range and none of a 32-day range', () => {
		const entries = [entry({ id: 'a', startDate: '2026-10-26', endDate: '2026-10-26' })];

		const month = project(entries, { rangeStart: '2026-10-01', rangeEnd: '2026-10-31' });
		const longer = project(entries, { rangeStart: '2026-10-01', rangeEnd: '2026-11-01' });

		expect(month.headings).toHaveLength(31);
		expect(rosterAvailabilityRow(month, 'p1').bars).not.toBeNull();
		expect(longer.window).toBeNull();
		expect(longer.headings).toEqual([]);
		expect(rosterAvailabilityRow(longer, 'p1')).toMatchObject({ bars: null, hint: 'Already on Leave 26 Oct' });
	});

	it('names an entry with an unknown status in the hint and leaves it off the strip', () => {
		const result = project([entry({ id: 'a', statusTypeId: 'gone', startDate: '2026-10-27' })]);

		const row = rosterAvailabilityRow(result, 'p1');
		expect(row).toMatchObject({ kind: 'overlap', hint: 'Unavailable 27 Oct overlaps' });
		expect(row.bars).toEqual({ bars: [], overflows: [] });
	});

	it('projects nothing without a valid range', () => {
		const result = projectBulkRosterAvailability({ overlaps: new Map(), statusTypes, range: null });

		expect(result.window).toBeNull();
		expect(result.rows.size).toBe(0);
	});
});

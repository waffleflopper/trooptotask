import { describe, expect, it } from 'vitest';
import type { AvailabilityEntry } from '$features/calendar/contracts';
import {
	rereadDatesFor,
	buildAddRecords,
	classifyAvailabilityOverlaps,
	classifyAvailabilityWrite,
	classifyBulkAddOverlaps,
	rangesOverlap,
	validateDateRange
} from './availabilityMutation';

function entry(over: Partial<AvailabilityEntry> & { id: string }): AvailabilityEntry {
	return {
		personnelId: 'p1',
		statusTypeId: 's1',
		startDate: '2026-01-01',
		endDate: '2026-01-05',
		note: null,
		...over
	};
}

describe('validateDateRange', () => {
	it('names the missing date', () => {
		expect(validateDateRange('', '2026-01-05')).toEqual({ valid: false, dayCount: 0, error: 'Choose a start date' });
		expect(validateDateRange('2026-01-05', '')).toEqual({ valid: false, dayCount: 0, error: 'Choose an end date' });
		expect(validateDateRange('', '')).toEqual({
			valid: false,
			dayCount: 0,
			error: 'Choose a start date and an end date'
		});
	});

	it('rejects an end before the start with a message and no day count', () => {
		expect(validateDateRange('2026-01-10', '2026-01-05')).toEqual({
			valid: false,
			dayCount: 0,
			error: 'End date must be on or after start date'
		});
	});

	it('counts a single-day range as one day', () => {
		expect(validateDateRange('2026-01-05', '2026-01-05')).toEqual({ valid: true, dayCount: 1, error: null });
	});

	it('counts a multi-day range inclusively', () => {
		expect(validateDateRange('2026-01-01', '2026-01-10')).toEqual({ valid: true, dayCount: 10, error: null });
	});

	it('counts correctly across a daylight-saving transition (UTC math)', () => {
		// US spring-forward 2026-03-08; local-midnight arithmetic would under-count here.
		expect(validateDateRange('2026-03-07', '2026-03-09').dayCount).toBe(3);
	});
});

describe('rangesOverlap', () => {
	it('is true when ranges overlap', () => {
		expect(rangesOverlap('2026-01-01', '2026-01-10', '2026-01-05', '2026-01-15')).toBe(true);
	});

	it('is true when ranges only touch at a boundary', () => {
		expect(rangesOverlap('2026-01-01', '2026-01-05', '2026-01-05', '2026-01-10')).toBe(true);
	});

	it('is false when ranges are disjoint', () => {
		expect(rangesOverlap('2026-01-01', '2026-01-05', '2026-01-06', '2026-01-10')).toBe(false);
	});
});

describe('classifyAvailabilityOverlaps', () => {
	const selected = new Set(['p1', 'p2']);
	const criteria = { personnelIds: selected, statusTypeId: 's1', startDate: '2026-01-05', endDate: '2026-01-10' };

	it('excludes entries for unselected personnel', () => {
		const result = classifyAvailabilityOverlaps([entry({ id: 'a', personnelId: 'p3' })], criteria);
		expect(result).toEqual({ exact: [], partial: [] });
	});

	it('excludes entries for a different status type', () => {
		const result = classifyAvailabilityOverlaps(
			[entry({ id: 'a', statusTypeId: 's2', startDate: '2026-01-06', endDate: '2026-01-08' })],
			criteria
		);
		expect(result).toEqual({ exact: [], partial: [] });
	});

	it('excludes entries that do not overlap the range', () => {
		const result = classifyAvailabilityOverlaps(
			[entry({ id: 'a', startDate: '2026-02-01', endDate: '2026-02-05' })],
			criteria
		);
		expect(result).toEqual({ exact: [], partial: [] });
	});

	it('classifies an entry fully inside the range as exact', () => {
		const inside = entry({ id: 'a', startDate: '2026-01-06', endDate: '2026-01-09' });
		const result = classifyAvailabilityOverlaps([inside], criteria);
		expect(result.exact).toEqual([inside]);
		expect(result.partial).toEqual([]);
	});

	it('classifies an entry that extends beyond the range as partial', () => {
		const spillsLeft = entry({ id: 'a', startDate: '2026-01-01', endDate: '2026-01-07' });
		const spillsRight = entry({ id: 'b', startDate: '2026-01-08', endDate: '2026-01-20' });
		const result = classifyAvailabilityOverlaps([spillsLeft, spillsRight], criteria);
		expect(result.exact).toEqual([]);
		expect(result.partial).toEqual([spillsLeft, spillsRight]);
	});
});

describe('buildAddRecords', () => {
	it('builds one record per personnel id with the shared status, range, and note', () => {
		expect(buildAddRecords(['p1', 'p2'], 's1', '2026-01-01', '2026-01-03', 'JRTC')).toEqual([
			{ personnelId: 'p1', statusTypeId: 's1', startDate: '2026-01-01', endDate: '2026-01-03', note: 'JRTC' },
			{ personnelId: 'p2', statusTypeId: 's1', startDate: '2026-01-01', endDate: '2026-01-03', note: 'JRTC' }
		]);
	});

	it('returns an empty batch when no personnel are selected', () => {
		expect(buildAddRecords([], 's1', '2026-01-01', '2026-01-03', null)).toEqual([]);
	});
});

describe('classifyAvailabilityWrite', () => {
	const saved = entry({ id: 'e1', startDate: '2026-01-05', endDate: '2026-01-07', note: 'Block leave' });
	const record = { personnelId: 'p1', statusTypeId: 's1', startDate: '2026-01-10', endDate: '2026-01-12', note: null };

	it('counts a create as saved only when a row the client did not know holds the submission', () => {
		const create = { kind: 'create', record } as const;
		const twin = entry({ id: 'old', startDate: '2026-01-10', endDate: '2026-01-12' });

		expect(classifyAvailabilityWrite(create, [twin], [twin])).toBe('not-saved');
		expect(classifyAvailabilityWrite(create, [twin], [twin, { ...twin, id: 'new' }])).toBe('saved');
	});

	it('counts an update as saved only when the row holds the new values', () => {
		const update = {
			kind: 'update',
			entry: saved,
			changes: { statusTypeId: 's1', startDate: '2026-01-06', endDate: '2026-01-07', note: 'Block leave' }
		} as const;

		expect(classifyAvailabilityWrite(update, [saved], [saved])).toBe('not-saved');
		expect(classifyAvailabilityWrite(update, [saved], [{ ...saved, startDate: '2026-01-06' }])).toBe('saved');
	});

	it('counts a removal as saved once the row is gone', () => {
		const remove = { kind: 'remove', entry: saved } as const;

		expect(classifyAvailabilityWrite(remove, [saved], [saved])).toBe('not-saved');
		expect(classifyAvailabilityWrite(remove, [saved], [])).toBe('saved');
	});

	it('re-reads the old and new start of a moved entry', () => {
		expect(
			rereadDatesFor({
				kind: 'update',
				entry: saved,
				changes: { statusTypeId: 's1', startDate: '2026-02-02', endDate: '2026-02-03', note: null }
			})
		).toEqual(['2026-01-05', '2026-02-02']);
	});
});

describe('classifyBulkAddOverlaps', () => {
	const leave = 'leave';
	const sick = 'sick';
	const range = { rangeStart: '2026-10-26', rangeEnd: '2026-10-28' };
	const classify = (entries: AvailabilityEntry[]) => classifyBulkAddOverlaps({ entries, statusTypeId: leave, range });

	it('blocks a person whose same-status entry touches only the last selected day', () => {
		const touching = entry({ id: 'a', statusTypeId: leave, startDate: '2026-10-28', endDate: '2026-10-31' });

		expect(classify([touching]).get('p1')).toEqual({
			kind: 'already-on-status',
			sameStatus: [touching],
			otherStatus: []
		});
	});

	it('keeps a person with only another status selectable and lists that entry', () => {
		const other = entry({ id: 'a', statusTypeId: sick, startDate: '2026-10-26', endDate: '2026-10-26' });

		expect(classify([other]).get('p1')).toEqual({ kind: 'overlap', sameStatus: [], otherStatus: [other] });
	});

	it('lets the same status win when a person has both kinds, keeping both original ranges', () => {
		const same = entry({ id: 'a', statusTypeId: leave, startDate: '2026-10-27', endDate: '2026-11-03' });
		const other = entry({ id: 'b', statusTypeId: sick, startDate: '2026-10-01', endDate: '2026-10-26' });

		expect(classify([other, same]).get('p1')).toEqual({
			kind: 'already-on-status',
			sameStatus: [same],
			otherStatus: [other]
		});
	});

	it('treats entries that end the day before or start the day after the range as clear', () => {
		const before = entry({ id: 'a', statusTypeId: leave, startDate: '2026-10-20', endDate: '2026-10-25' });
		const after = entry({
			id: 'b',
			personnelId: 'p2',
			statusTypeId: sick,
			startDate: '2026-10-29',
			endDate: '2026-10-30'
		});

		expect(classify([before, after]).size).toBe(0);
	});

	it('keeps every intersecting entry of each person separate from other people', () => {
		const first = entry({ id: 'a', statusTypeId: sick, startDate: '2026-10-20', endDate: '2026-10-26' });
		const second = entry({ id: 'b', statusTypeId: 'tdy', startDate: '2026-10-28', endDate: '2026-10-29' });
		const other = entry({
			id: 'c',
			personnelId: 'p2',
			statusTypeId: leave,
			startDate: '2026-10-27',
			endDate: '2026-10-27'
		});

		const result = classify([first, second, other]);

		expect(result.get('p1')).toEqual({ kind: 'overlap', sameStatus: [], otherStatus: [first, second] });
		expect(result.get('p2')?.kind).toBe('already-on-status');
		expect([...result.keys()].sort()).toEqual(['p1', 'p2']);
	});
});

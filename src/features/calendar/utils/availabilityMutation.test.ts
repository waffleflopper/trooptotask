import { describe, expect, it } from 'vitest';
import type { AvailabilityEntry } from '$lib/types';
import {
	buildAddRecords,
	classifyAvailabilityOverlaps,
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
	it('reports neither valid nor an error when a date is missing', () => {
		expect(validateDateRange('', '2026-01-05')).toEqual({ valid: false, dayCount: 0, error: null });
		expect(validateDateRange('2026-01-05', '')).toEqual({ valid: false, dayCount: 0, error: null });
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

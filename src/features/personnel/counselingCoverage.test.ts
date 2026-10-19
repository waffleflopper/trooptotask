import { describe, expect, it } from 'vitest';
import {
	coverageCaption,
	coverageMonths,
	coverageWindow,
	coverageWindowStart,
	coveredMonthsOf,
	daysBetween,
	lastCounseledLabel
} from './counselingCoverage';

describe('counseling coverage window', () => {
	it('runs from eleven months before the viewer day to the current month, across a year boundary', () => {
		expect(coverageWindow('2026-02-14')).toEqual([
			'2025-03',
			'2025-04',
			'2025-05',
			'2025-06',
			'2025-07',
			'2025-08',
			'2025-09',
			'2025-10',
			'2025-11',
			'2025-12',
			'2026-01',
			'2026-02'
		]);
		expect(coverageWindowStart('2026-02-14')).toBe('2025-03-01');
	});

	it('keeps only dates inside the window and counts a month once', () => {
		const dates = ['2026-10-02', '2026-10-28', '2025-10-31', '2025-11-01', '2024-01-05', '2026-11-01'];

		expect(coveredMonthsOf(dates, '2026-10-19')).toEqual(['2026-10', '2025-11']);
	});

	it('does not count a counseling dated later in the current month', () => {
		expect(coveredMonthsOf(['2026-10-30'], '2026-10-19')).toEqual([]);
	});

	it('labels each month and marks the uncovered ones', () => {
		const months = coverageMonths('2026-10-19', ['2026-10', '2026-09', '2026-08', '2026-05']);

		expect(months.map((month) => `${month.label}${month.covered ? '+' : '-'}`)).toEqual([
			'Nov-',
			'Dec-',
			'Jan-',
			'Feb-',
			'Mar-',
			'Apr-',
			'May+',
			'Jun-',
			'Jul-',
			'Aug+',
			'Sep+',
			'Oct+'
		]);
	});
});

describe('coverage caption', () => {
	it('names the gaps in reading order', () => {
		const all = coverageMonths('2026-09-30', []).map((month) => month.key);
		const covered = all.filter((key) => !['2026-06', '2026-07'].includes(key));

		expect(coverageCaption(coverageMonths('2026-09-30', covered))).toBe(
			'10 of the last 12 months have a counseling on record. Gaps in Jun and Jul.'
		);
	});

	it('lists three gaps with commas and one gap alone', () => {
		const all = coverageMonths('2026-09-30', []).map((month) => month.key);

		expect(
			coverageCaption(
				coverageMonths(
					'2026-09-30',
					all.filter((key) => !['2026-01', '2026-02', '2026-03'].includes(key))
				)
			)
		).toBe('9 of the last 12 months have a counseling on record. Gaps in Jan, Feb and Mar.');
		expect(
			coverageCaption(
				coverageMonths(
					'2026-09-30',
					all.filter((key) => key !== '2026-04')
				)
			)
		).toBe('11 of the last 12 months have a counseling on record. Gaps in Apr.');
	});

	it('says nothing about gaps when every month is covered', () => {
		const all = coverageMonths('2026-09-30', []).map((month) => month.key);

		expect(coverageCaption(coverageMonths('2026-09-30', all))).toBe(
			'12 of the last 12 months have a counseling on record.'
		);
	});
});

describe('last counseled label', () => {
	it('counts calendar days in the viewer day, including over a month and daylight-saving change', () => {
		expect(daysBetween('2026-09-25', '2026-10-19')).toBe(24);
		expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
	});

	it('reads today, yesterday and N days ago', () => {
		expect(lastCounseledLabel('2026-10-19', '2026-10-19')).toBe('Last counseled today');
		expect(lastCounseledLabel('2026-10-18', '2026-10-19')).toBe('Last counseled yesterday');
		expect(lastCounseledLabel('2026-09-25', '2026-10-19')).toBe('Last counseled 24 days ago');
	});

	it('says so when nothing is on record', () => {
		expect(lastCounseledLabel(null, '2026-10-19')).toBe('No counseling on record');
	});
});

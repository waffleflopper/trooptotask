import { describe, expect, it } from 'vitest';
import { previewChangeOfRater } from './changeRaterPreview';

const open = { ratingPeriodStart: '2025-12-29', ratingPeriodEnd: '2026-12-28' };

describe('previewChangeOfRater', () => {
	it('counts the first and the last day as rated days', () => {
		expect(previewChangeOfRater(open, '2025-12-29')?.ratedDays).toBe(1);
		expect(previewChangeOfRater(open, '2026-03-28')?.ratedDays).toBe(90);
	});

	it('flags a period shorter than 90 days, and accepts exactly 90', () => {
		expect(previewChangeOfRater(open, '2026-03-27')?.meetsMinimum).toBe(false);
		expect(previewChangeOfRater(open, '2026-03-28')?.meetsMinimum).toBe(true);
	});

	it('closes the open Evaluation through the change date and opens an annual the next day', () => {
		expect(previewChangeOfRater(open, '2026-11-14')).toMatchObject({
			closes: { start: '2025-12-29', end: '2026-11-14' },
			opens: { start: '2026-11-15', end: '2027-11-14' }
		});
	});

	it('carries a change on the last day of a month into the next month', () => {
		expect(previewChangeOfRater(open, '2026-02-28')?.opens?.start).toBe('2026-03-01');
	});

	it('has no preview for a date outside the rating period', () => {
		expect(previewChangeOfRater(open, '2025-12-28')).toBeNull();
		expect(previewChangeOfRater(open, '2026-12-29')).toBeNull();
		expect(previewChangeOfRater(open, '')).toBeNull();
	});
});

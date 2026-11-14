import { describe, expect, it } from 'vitest';
import { evaluation, scheme } from './ratingSchemeLineTestData';
import { isRaterLocked, toRatingSchemeLines } from './ratingSchemeLines';

describe('toRatingSchemeLines', () => {
	it('gives each scheme its open Evaluation and nothing for completed or untracked ones', () => {
		const lines = toRatingSchemeLines(
			[scheme('a'), scheme('b'), scheme('c')],
			[
				evaluation('a-open', 'a', { workflowStatus: 'with-rater' }),
				evaluation('b-done', 'b', { workflowStatus: 'completed' }),
				evaluation('c-untracked', 'c', { workflowStatus: null })
			]
		);
		expect(lines.map((line) => line.open?.id ?? null)).toEqual(['a-open', null, null]);
	});

	it('keeps archived schemes as lines, with an Evaluation that is still open', () => {
		const [line] = toRatingSchemeLines(
			[scheme('a', { archivedAt: '2026-02-01T00:00:00Z' })],
			[evaluation('a-open', 'a')]
		);
		expect(line.archivedAt).not.toBeNull();
		expect(line.open?.id).toBe('a-open');
	});

	it('takes the later thru when older data left a scheme two open Evaluations', () => {
		const [line] = toRatingSchemeLines(
			[scheme('a')],
			[
				evaluation('older', 'a', { ratingPeriodEnd: '2026-06-30' }),
				evaluation('later', 'a', { ratingPeriodEnd: '2027-06-30' })
			]
		);
		expect(line.open?.id).toBe('later');
	});
});

describe('isRaterLocked', () => {
	it('locks the rater only while an Evaluation is open', () => {
		expect(isRaterLocked({ open: evaluation('e', 'a') })).toBe(true);
		expect(isRaterLocked({ open: null })).toBe(false);
	});
});

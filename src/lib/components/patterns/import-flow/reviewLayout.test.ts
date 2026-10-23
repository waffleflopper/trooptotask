import { describe, expect, it } from 'vitest';
import type { ReviewedRow } from './rowModel';
import { cardContext, cardRowHeight, type ReviewColumn } from './reviewLayout';
import { sourceRowId } from './rowModel';

const columns: ReviewColumn[] = [
	{ field: 'training', label: 'Training', kind: 'text' },
	{ field: 'completed', label: 'Completed', kind: 'text' },
	{ field: 'note', label: 'Notes', kind: 'text' }
];
const row = {
	id: sourceRowId(0, 1),
	sheetIndex: 0,
	sheetName: 'Tracker',
	rowNumber: 2,
	raw: { training: 'CPR/BLS', completed: 'X', note: 'Refresher' },
	cells: []
};

describe('review cards', () => {
	it('names the record an update changes beside the fields it changes', () => {
		const update: ReviewedRow<unknown> = {
			row,
			resolved: { completed: '2026-05-04' },
			outcome: 'update',
			key: 'p1:t-cpr',
			change: {},
			diff: [{ label: 'Notes', before: '', after: 'Refresher' }]
		};
		const unchanged: ReviewedRow<unknown> = { row, outcome: 'unchanged', key: 'p1:t-cpr' };

		expect(cardContext(update, columns)).toBe('CPR/BLS · 2026-05-04');
		expect(cardRowHeight(update, [], columns)).toBeGreaterThan(cardRowHeight(unchanged, [], columns));
	});
});

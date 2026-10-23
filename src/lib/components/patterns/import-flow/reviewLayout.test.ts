import { describe, expect, it } from 'vitest';
import { cardRowHeight, wrappedLines, type ReviewColumn } from './reviewLayout';
import { sourceRowId, type ReviewedRow } from './rowModel';

const sixPerChar = (text: string) => text.length * 6;
const source = {
	id: sourceRowId(0, 3),
	sheetIndex: 0,
	sheetName: 'kept',
	rowNumber: 3,
	raw: { note: 'Leave' },
	cells: []
};
const note: ReviewColumn = { field: 'note', label: 'Notes', kind: 'text' };
const held = 'Row 3 on kept would remove this saved record. Skip one of these rows.';

function fix(field: string, message: string): ReviewedRow<unknown> {
	return { row: source, outcome: 'fix', problems: [{ field, message }], questions: [] };
}

describe('wrappedLines', () => {
	it('breaks between words where the next word would pass the width', () => {
		expect(wrappedLines(held, 120, sixPerChar)).toBe(4);
		expect(wrappedLines(held, 600, sixPerChar)).toBe(1);
	});

	it('gives a word wider than the line as many lines as it fills', () => {
		expect(wrappedLines('Sheet a-very-long-sheet-name-without-spaces', 60, sixPerChar)).toBe(5);
	});
});

describe('cardRowHeight', () => {
	const lines = (width: number) => (text: string) => wrappedLines(text, width, sixPerChar);

	it('grows a fix card by one text line for each extra line its message wraps to', () => {
		expect(cardRowHeight(fix('', held), [], [], lines(600))).toBe(92);
		expect(cardRowHeight(fix('', held), [], [], lines(180))).toBe(124);
	});

	it('grows the field a wrapped message sits under', () => {
		expect(cardRowHeight(fix('note', held), [], [note], lines(600))).toBe(140);
		expect(cardRowHeight(fix('note', held), [], [note], lines(240))).toBe(156);
	});
});

import { describe, expect, it } from 'vitest';
import { wrappedLines } from './reviewLayout';

const sixPerChar = (text: string) => text.length * 6;
const held = 'Row 3 on kept would remove this saved record. Skip one of these rows.';

describe('wrappedLines', () => {
	it('breaks between words where the next word would pass the width', () => {
		expect(wrappedLines(held, 120, sixPerChar)).toBe(4);
		expect(wrappedLines(held, 600, sixPerChar)).toBe(1);
	});

	it('gives a word wider than the line as many lines as it fills', () => {
		expect(wrappedLines('Sheet a-very-long-sheet-name-without-spaces', 60, sixPerChar)).toBe(5);
	});
});

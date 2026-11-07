import { describe, expect, it } from 'vitest';
import { scrollLeftToRevealColumn } from './revealColumn';

// A 390 px phone: 120 px sticky name column, so 270 px of date area showing 8 columns of 32 px plus 14 px.
const phone = { clientWidth: 390, leadingWidth: 120, columnWidth: 32 };

describe('scrollLeftToRevealColumn', () => {
	it('leaves a column that is already fully inside the date area', () => {
		expect(scrollLeftToRevealColumn({ ...phone, scrollLeft: 0, index: 5 })).toBeNull();
	});

	it('moves a column past the right edge to the leading edge of the date area', () => {
		expect(scrollLeftToRevealColumn({ ...phone, scrollLeft: 0, index: 19 })).toBe(608);
	});

	it('moves a column that is only partly visible on the right', () => {
		expect(scrollLeftToRevealColumn({ ...phone, scrollLeft: 0, index: 8 })).toBe(256);
	});

	it('moves a column hidden under the sticky name column back to the leading edge', () => {
		expect(scrollLeftToRevealColumn({ ...phone, scrollLeft: 320, index: 9 })).toBe(288);
	});

	it('leaves the last column that fits exactly', () => {
		expect(scrollLeftToRevealColumn({ ...phone, scrollLeft: 0, index: 7 })).toBeNull();
	});

	it('leaves everything when the date area shows all columns', () => {
		expect(
			scrollLeftToRevealColumn({ scrollLeft: 0, clientWidth: 1200, leadingWidth: 160, columnWidth: 30, index: 30 })
		).toBeNull();
	});
});

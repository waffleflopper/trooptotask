import { describe, expect, it } from 'vitest';
import { matchesFacets } from './dutyPickerFilter';

describe('matchesFacets', () => {
	const medic = { mos: '68W', role: ' Medic ' };

	it('ignores case and surrounding space', () => {
		expect(matchesFacets(medic, { mos: ['68w'], role: ['MEDIC'] })).toBe(true);
	});

	it('needs one value per constrained facet and leaves empty facets unconstrained', () => {
		expect(matchesFacets(medic, { mos: ['88M', '68W'], role: [] })).toBe(true);
		expect(matchesFacets(medic, { mos: ['68W'], role: ['Driver'] })).toBe(false);
	});

	it('does not ignore a selected value nobody has', () => {
		expect(matchesFacets(medic, { mos: ['25B'], role: [] })).toBe(false);
	});
});

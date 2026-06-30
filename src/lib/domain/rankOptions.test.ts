import { describe, expect, it } from 'vitest';
import { rankCodesForOptions } from './rankOptions';

describe('rankCodesForOptions', () => {
	it('normalizes observed rank strings before sorting and emitting options', () => {
		expect(rankCodesForOptions({ observedRanks: [' SFC ', 'SGT'] })).toEqual(['SFC', 'SGT']);
	});

	it('uses fallback ranks when the Organization catalog is empty', () => {
		expect(rankCodesForOptions({ rankCatalog: [], fallbackRanks: ['SGT', 'CPL'] })).toEqual(['SGT', 'CPL']);
	});
});

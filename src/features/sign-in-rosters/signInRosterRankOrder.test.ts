import { describe, expect, it } from 'vitest';
import { sortSignInRosterRows } from './signInRosterRankOrder';

describe('sortSignInRosterRows', () => {
	it('uses built-in pay-grade ordering when the Organization rank catalog is empty', () => {
		const rows = [
			{ id: 'unknown', rank: 'LOCAL-CADET', lastName: 'Able', firstName: 'Alex' },
			{ id: 'e5', rank: 'SGT', lastName: 'Baker', firstName: 'Blake' },
			{ id: 'e7', rank: 'SFC', lastName: 'Charlie', firstName: 'Casey' }
		];

		expect(sortSignInRosterRows(rows, 'rank', []).map((row) => row.id)).toEqual(['e7', 'e5', 'unknown']);
	});
});

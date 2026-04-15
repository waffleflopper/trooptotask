import { describe, expect, it } from 'vitest';
import { PERSONNEL_COLUMNS, autoMapColumns, detectHeaderRow } from './columnMapping';

describe('PERSONNEL_COLUMNS', () => {
	it('detects ETS and PCS / DEROS headers for personnel imports', () => {
		expect(detectHeaderRow(['Rank', 'Last Name', 'First Name', 'ETS', 'PCS / DEROS'], PERSONNEL_COLUMNS)).toBe(true);
	});

	it('maps ETS and PCS / DEROS columns into the personnel import shape', () => {
		const mappings = autoMapColumns(['Rank', 'Last Name', 'First Name', 'ETS', 'PCS / DEROS'], PERSONNEL_COLUMNS, true);

		expect(mappings).toEqual([
			{ columnIndex: 0, fieldKey: 'rank' },
			{ columnIndex: 1, fieldKey: 'lastName' },
			{ columnIndex: 2, fieldKey: 'firstName' },
			{ columnIndex: 3, fieldKey: 'ets' },
			{ columnIndex: 4, fieldKey: 'deros' }
		]);
	});
});

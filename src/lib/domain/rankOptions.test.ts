import { describe, expect, it } from 'vitest';
import { rankCodesForOptions } from './rankOptions';

describe('rankCodesForOptions', () => {
	it('normalizes observed rank strings before sorting and emitting options', () => {
		expect(rankCodesForOptions({ observedRanks: [' SFC ', 'SGT'] })).toEqual(['SFC', 'SGT']);
	});

	it('uses fallback ranks when the Organization catalog is empty', () => {
		expect(rankCodesForOptions({ rankCatalog: [], fallbackRanks: ['SGT', 'CPL'] })).toEqual(['SGT', 'CPL']);
	});

	it('keeps observed aliases for active catalog ranks without reintroducing retired or ambiguous ranks', () => {
		expect(
			rankCodesForOptions({
				rankCatalog: [
					{
						code: 'SGT',
						label: 'Sergeant',
						service: 'army',
						category: 'enlisted',
						payGrade: 'E-5',
						state: 'active',
						sortOrder: 0
					},
					{
						code: 'SP4',
						label: 'Specialist Four',
						service: 'army',
						category: 'enlisted',
						payGrade: 'E-4',
						state: 'retired',
						sortOrder: 1
					},
					{
						code: 'CAPT',
						label: 'Captain',
						service: 'navy',
						category: 'officer',
						payGrade: 'O-6',
						state: 'active',
						sortOrder: 2
					},
					{
						code: 'Capt',
						label: 'Captain',
						service: 'air-force',
						category: 'officer',
						payGrade: 'O-3',
						state: 'active',
						sortOrder: 3
					}
				],
				observedRanks: ['sgt', 'SP4', 'capt', 'LOCAL']
			})
		).toEqual(['CAPT', 'Capt', 'SGT', 'sgt']);
	});
});

import { describe, expect, it } from 'vitest';
import { PERSONNEL_RANK_ORDER, comparePersonnelByRankThenName } from './personnelRank';
import type { Personnel } from '$lib/types';

function person(overrides: Partial<Personnel>): Personnel {
	return {
		id: overrides.id ?? 'person',
		rank: overrides.rank ?? 'SGT',
		lastName: overrides.lastName ?? 'Soldier',
		firstName: overrides.firstName ?? 'Sam',
		mos: '',
		clinicRole: '',
		groupId: null,
		groupName: '',
		...overrides
	};
}

describe('personnel rank ordering', () => {
	it('preserves the legacy Army rank order export for existing consumers', () => {
		expect(PERSONNEL_RANK_ORDER).toEqual([
			'GEN',
			'LTG',
			'MG',
			'BG',
			'COL',
			'LTC',
			'MAJ',
			'CPT',
			'1LT',
			'2LT',
			'CW5',
			'CW4',
			'CW3',
			'CW2',
			'WO1',
			'CSM',
			'SGM',
			'1SG',
			'MSG',
			'SFC',
			'SSG',
			'SGT',
			'CPL',
			'SPC',
			'PFC',
			'PV2',
			'PV1',
			'CIV'
		]);
	});

	it('orders DA6 roster rows by highest pay grade then name', () => {
		const ordered = [
			person({ id: 'spc-z', rank: 'SPC', lastName: 'Zulu' }),
			person({ id: 'cpt-b', rank: 'CPT', lastName: 'Baker' }),
			person({ id: 'ssg-a', rank: 'SSG', lastName: 'Able' }),
			person({ id: 'cpt-a', rank: 'CPT', lastName: 'Able' })
		].sort(comparePersonnelByRankThenName);

		expect(ordered.map((item) => item.id)).toEqual(['cpt-a', 'cpt-b', 'ssg-a', 'spc-z']);
	});

	it('uses deterministic name fallback when rank is unknown', () => {
		const ordered = [
			person({ id: 'x-z', rank: 'LOCAL', lastName: 'Zulu' }),
			person({ id: 'x-a', rank: 'LOCAL', lastName: 'Able' }),
			person({ id: 'sgt', rank: 'SGT', lastName: 'Known' })
		].sort(comparePersonnelByRankThenName);

		expect(ordered.map((item) => item.id)).toEqual(['sgt', 'x-a', 'x-z']);
	});
});

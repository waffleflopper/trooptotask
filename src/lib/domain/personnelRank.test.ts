import { describe, expect, it } from 'vitest';
import { comparePersonnelByRankThenName } from './personnelRank';
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

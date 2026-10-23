import { describe, expect, it } from 'vitest';
import type { Personnel } from '../personnel.types';
import type { PersonNameColumns } from './personnelImportColumns';
import { rosterPersonReference } from './personMatching';

function person(id: string, rank: string, groupName: string): Personnel {
	return { id, rank, lastName: 'Garcia', firstName: 'Luis', mos: '68W', clinicRole: '', groupId: null, groupName };
}

const reference = rosterPersonReference<PersonNameColumns>([
	person('p4', 'SGT', '1st Platoon'),
	person('p5', 'SPC', '1st Platoon'),
	{ ...person('p6', 'PFC', 'HQ'), lastName: 'Banks', firstName: 'Tamara' }
]);

function match(raw: Partial<Record<keyof PersonNameColumns, string>>) {
	const lookup = reference.key(raw);
	return lookup ? reference.find(lookup.key) : null;
}

describe('roster person reference', () => {
	it('asks which person for a shared name with only the matching people, and lets rank break the tie', () => {
		const shared = match({ lastName: 'Garcia', firstName: 'Luis' });
		expect(shared?.kind === 'many' && shared.candidates.map((option) => option.id)).toEqual(['p4', 'p5']);
		expect(match({ lastName: 'Garcia', firstName: 'Luis', rank: 'SPC' })).toMatchObject({
			kind: 'one',
			option: { id: 'p5' }
		});
		expect(match({ lastName: 'banks', firstName: 'tamara' })).toMatchObject({ kind: 'one', option: { id: 'p6' } });
		expect(match({ lastName: 'Nguyen', firstName: 'Kim' })).toEqual({ kind: 'none' });
	});
});

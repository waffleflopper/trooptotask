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
	it('matches a normalized DoD ID despite different name, group, and rank, then falls back for an unknown ID', () => {
		const reference = rosterPersonReference<PersonNameColumns>(
			[person('p4', 'SGT', '1st Platoon'), { ...person('p6', 'PFC', 'HQ'), lastName: 'Banks', firstName: 'Tamara' }],
			[{ personnelId: 'p4', dodId: '0123456789' }]
		);
		for (const [dodId, expectedId] of [
			['012-345 6789', 'p4'],
			['0000000001', 'p6']
		]) {
			const key = reference.key({ lastName: 'Banks', firstName: 'Tamara', groupName: 'HQ', rank: 'PFC', dodId });
			if (!key) throw new Error('Missing person lookup');
			expect(reference.find(key.key)).toMatchObject({ kind: 'one', option: { id: expectedId } });
		}
	});
	it('uses name matching when an ID has no unique active holder', () => {
		const roster = [person('p4', 'SGT', '1st Platoon'), person('p5', 'SPC', 'HQ')];
		const reference = rosterPersonReference<PersonNameColumns>(roster, [
			{ personnelId: 'p4', dodId: '0123456789' },
			{ personnelId: 'p5', dodId: '0123456789' },
			{ personnelId: 'archived', dodId: '0000000001' }
		]);
		for (const dodId of ['0123456789', '0000000001']) {
			const lookup = reference.key({ lastName: 'Garcia', firstName: 'Luis', rank: 'SPC', dodId });
			if (!lookup) throw new Error('Missing person lookup');
			expect(reference.find(lookup.key)).toMatchObject({ kind: 'one', option: { id: 'p5' } });
		}
	});
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

	it('separates ambiguous ranks but shares the lookup for the same name, group and rank', () => {
		const raw = { lastName: 'Garcia', firstName: 'Luis', groupName: '1st Platoon' };
		const sergeant = reference.key({ ...raw, rank: 'SSG' });
		const privateFirstClass = reference.key({ ...raw, rank: 'PFC' });
		expect(sergeant).not.toBeNull();
		expect(privateFirstClass).not.toBeNull();
		if (!sergeant || !privateFirstClass) throw new Error('Missing person lookup');
		expect(sergeant.key).not.toBe(privateFirstClass.key);
		expect(reference.key({ ...raw, rank: 'ssg' })?.key).toBe(sergeant.key);
		for (const lookup of [sergeant, privateFirstClass]) {
			const found = reference.find(lookup.key);
			expect(found.kind === 'many' && found.candidates.map((option) => option.id)).toEqual(['p4', 'p5']);
		}
	});
});

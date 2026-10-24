import { describe, expect, it } from 'vitest';
import type { Group, RankCatalogEntry } from './contracts';
import type { Personnel } from './personnel.types';
import {
	personnelDraftChanges,
	personnelDraftOf,
	personnelPayloadOf,
	rankOptionsFor,
	validatePersonnelDraft
} from './personnelDraft';

const groups: Group[] = [
	{ id: 'g-1', name: '1st Platoon', sortOrder: 0 },
	{ id: 'g-2', name: '2nd Platoon', sortOrder: 1 }
];

const okafor: Personnel = {
	id: 'p-1',
	rank: 'SGT',
	lastName: 'Okafor',
	firstName: 'Daniel',
	mos: '68W',
	clinicRole: 'Treatment NCO',
	ets: '2027-03-14',
	deros: null,
	groupId: 'g-2',
	groupName: '2nd Platoon'
};

describe('personnelDraftChanges', () => {
	it('lists each changed field as old and new values in the summary order', () => {
		const opening = personnelDraftOf(okafor);
		const draft = { ...opening, clinicRole: 'Senior Treatment NCO', rank: 'SSG', groupId: 'g-1', ets: '' };

		expect(personnelDraftChanges(opening, draft, groups)).toEqual([
			{ field: 'rank', label: 'Rank', from: 'SGT', to: 'SSG' },
			{ field: 'clinicRole', label: 'Duty role', from: 'Treatment NCO', to: 'Senior Treatment NCO' },
			{ field: 'groupId', label: 'Group', from: '2nd Platoon', to: '1st Platoon' },
			{ field: 'ets', label: 'ETS', from: 'Mar 14, 2027', to: 'None' }
		]);
	});

	it('reports nothing for edits that save as the same value', () => {
		const opening = personnelDraftOf(okafor);

		expect(personnelDraftChanges(opening, { ...opening, mos: ' 68W ', lastName: 'Okafor  ' }, groups)).toEqual([]);
	});
});

describe('validatePersonnelDraft', () => {
	const rules = { allowUnassigned: true, groups };

	it('requires a rank and both names, ignoring surrounding spaces', () => {
		const draft = { ...personnelDraftOf(okafor), rank: '', lastName: '   ', firstName: '' };

		expect(validatePersonnelDraft(draft, rules)).toEqual({
			rank: 'Select a rank.',
			lastName: 'Enter a last name.',
			firstName: 'Enter a first name.'
		});
	});

	it('asks for a permitted Group only for an actor with no unassigned scope', () => {
		const draft = { ...personnelDraftOf(null, 'SPC'), lastName: 'Nolan', firstName: 'Avery' };

		expect(validatePersonnelDraft(draft, { ...rules, allowUnassigned: false })).toEqual({
			groupId: 'Select a permitted Group.'
		});
		expect(validatePersonnelDraft({ ...draft, groupId: 'g-1' }, { ...rules, allowUnassigned: false })).toEqual({});
		expect(validatePersonnelDraft(draft, rules)).toEqual({});
	});
});

describe('personnelPayloadOf', () => {
	it('trims text, saves empty dates as null and names the Group', () => {
		const draft = { ...personnelDraftOf(okafor), lastName: ' Okafor ', ets: '', deros: '2027-09-01', groupId: 'g-1' };

		expect(personnelPayloadOf(draft, groups)).toEqual({
			rank: 'SGT',
			lastName: 'Okafor',
			firstName: 'Daniel',
			mos: '68W',
			clinicRole: 'Treatment NCO',
			ets: null,
			deros: '2027-09-01',
			groupId: 'g-1',
			groupName: '1st Platoon'
		});
		expect(personnelPayloadOf({ ...draft, groupId: '' }, groups)).toMatchObject({ groupId: null, groupName: '' });
	});
});

describe('rankOptionsFor', () => {
	const entry = (code: string, state: RankCatalogEntry['state']): RankCatalogEntry => ({
		code,
		label: code,
		service: 'army',
		category: 'enlisted',
		payGrade: 'E-5',
		state,
		sortOrder: 0
	});

	it('lists active ranks and keeps a Person’s retired rank selectable', () => {
		const catalog = [entry('SGT', 'active'), entry('SSG', 'active'), entry('CPL', 'retired')];

		expect(rankOptionsFor(catalog, 'sgt').map((option) => option.value)).toEqual(['SGT', 'SSG']);
		expect(rankOptionsFor(catalog, 'CPL').map((option) => option.value)).toEqual(['CPL', 'SGT', 'SSG']);
	});
});

import { describe, expect, it } from 'vitest';
import { createRosterReadModel, rosterGroupFilterValue } from './rosterReadModel';
import type { Personnel } from '$lib/types';

function makePerson(overrides: Partial<Personnel>): Personnel {
	return {
		id: overrides.id ?? crypto.randomUUID(),
		firstName: 'Test',
		lastName: 'Person',
		rank: 'SGT',
		mos: '11B',
		clinicRole: '',
		groupId: null,
		groupName: '',
		...overrides
	};
}

describe('createRosterReadModel', () => {
	const personnel = [
		makePerson({
			id: 'alpha-1',
			firstName: 'Alice',
			lastName: 'Smith',
			rank: 'SGT',
			mos: '11B',
			clinicRole: 'Team Leader',
			groupId: 'group-a',
			groupName: 'Alpha'
		}),
		makePerson({
			id: 'bravo-1',
			firstName: 'Bailey',
			lastName: 'Jones',
			rank: 'SSG',
			mos: '68W',
			clinicRole: 'Medic',
			groupId: 'group-b',
			groupName: 'Bravo'
		}),
		makePerson({
			id: 'unassigned-1',
			firstName: 'Casey',
			lastName: 'Adams',
			rank: 'PFC',
			mos: '25U',
			clinicRole: '',
			groupId: null,
			groupName: ''
		})
	];

	it('makes full and Scope Set views explicit', () => {
		const roster = createRosterReadModel({ personnel, fallbackGroupName: 'Test Unit' });

		expect(roster.full().personnel.map((person) => person.id)).toEqual(['alpha-1', 'bravo-1', 'unassigned-1']);
		expect(roster.scoped({ kind: 'groups', groupIds: ['group-b'] }).personnel.map((person) => person.id)).toEqual([
			'bravo-1'
		]);
		expect(roster.scoped({ kind: 'organization' }).personnel.map((person) => person.id)).toEqual([
			'alpha-1',
			'bravo-1',
			'unassigned-1'
		]);
	});

	it('keeps ungrouped Personnel Records out of whole-Group Scope Sets', () => {
		const roster = createRosterReadModel({ personnel, fallbackGroupName: 'Test Unit' });

		expect(
			roster.scoped({ kind: 'groups', groupIds: ['group-a', 'group-b'] }).personnel.map((person) => person.id)
		).toEqual(['alpha-1', 'bravo-1']);
	});

	it('builds grouped roster options from the scoped roster before group and search filters', () => {
		const roster = createRosterReadModel({
			personnel,
			pinnedGroups: ['Bravo'],
			fallbackGroupName: 'Test Unit'
		});
		const fullView = roster.full();
		const bravoFilter = rosterGroupFilterValue(fullView.personnelByGroup[0]);
		const filteredView = roster.full({ groupFilter: bravoFilter, search: '68w' });

		expect(fullView.personnelByGroup.map((group) => group.group)).toEqual(['Bravo', 'Alpha', 'Unassigned']);
		expect(fullView.groupFilterOptions).toEqual([
			{ value: '', label: 'All groups', count: 3 },
			{ value: 'group-b', label: 'Bravo', count: 1 },
			{ value: 'group-a', label: 'Alpha', count: 1 },
			{ value: 'name:Unassigned', label: 'Unassigned', count: 1 }
		]);
		expect(filteredView.personnel.map((person) => person.id)).toEqual(['bravo-1']);
		expect(filteredView.groupFilterOptions).toEqual(fullView.groupFilterOptions);
	});

	it('makes active, archived, and all Personnel Record views explicit', () => {
		const roster = createRosterReadModel({
			personnel: [...personnel, makePerson({ id: 'archived-1', archivedAt: '2026-01-01' })]
		});

		expect(roster.full().personnel.map((person) => person.id)).toContain('archived-1');
		expect(roster.full({ status: 'all' }).personnel.map((person) => person.id)).toContain('archived-1');
		expect(roster.full({ status: 'active' }).personnel.map((person) => person.id)).not.toContain('archived-1');
		expect(roster.full({ status: 'archived' }).personnel.map((person) => person.id)).toEqual(['archived-1']);
	});

	it('searches rank, MOS, Duty Role, Group, and names consistently', () => {
		const roster = createRosterReadModel({ personnel, fallbackGroupName: 'Test Unit' });

		expect(roster.full({ search: 'medic' }).personnel.map((person) => person.id)).toEqual(['bravo-1']);
		expect(roster.full({ search: 'alpha' }).personnel.map((person) => person.id)).toEqual(['alpha-1']);
		expect(roster.full({ search: 'Casey Adams' }).personnel.map((person) => person.id)).toEqual(['unassigned-1']);
	});
});

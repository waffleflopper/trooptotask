import { describe, expect, it } from 'vitest';
import { compareRosterBands, createRosterReadModel, rosterGroupFilterValue } from './rosterReadModel';
import type { Personnel } from './personnel.types';

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
		const roster = createRosterReadModel({ personnel, groups: [], pinnedGroupIds: [], fallbackGroupName: 'Test Unit' });

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
		const roster = createRosterReadModel({ personnel, groups: [], pinnedGroupIds: [], fallbackGroupName: 'Test Unit' });

		expect(
			roster.scoped({ kind: 'groups', groupIds: ['group-a', 'group-b'] }).personnel.map((person) => person.id)
		).toEqual(['alpha-1', 'bravo-1']);
	});

	it('keeps archived and unassigned records outside active Group-scoped views', () => {
		const roster = createRosterReadModel({
			personnel: [
				...personnel,
				makePerson({
					id: 'archived-alpha',
					lastName: 'Zulu',
					groupId: 'group-a',
					groupName: 'Alpha',
					archivedAt: '2026-01-01'
				}),
				makePerson({ id: 'archived-unassigned', archivedAt: '2026-01-01' })
			],
			groups: [],
			pinnedGroupIds: []
		});

		expect(
			roster.scoped({ kind: 'groups', groupIds: ['group-a'] }, { status: 'active' }).personnel.map((p) => p.id)
		).toEqual(['alpha-1']);
		expect(
			roster.scoped({ kind: 'groups', groupIds: ['group-a'] }, { status: 'archived' }).personnel.map((p) => p.id)
		).toEqual(['archived-alpha']);
		expect(
			roster.scoped({ kind: 'groups', groupIds: ['group-a'] }, { status: 'all' }).personnel.map((p) => p.id)
		).toEqual(['alpha-1', 'archived-alpha']);
	});

	it('builds grouped roster options from the scoped roster before group and search filters', () => {
		const roster = createRosterReadModel({
			personnel,
			groups: [],
			pinnedGroupIds: ['group-b'],
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
			personnel: [...personnel, makePerson({ id: 'archived-1', archivedAt: '2026-01-01' })],
			groups: [],
			pinnedGroupIds: []
		});

		expect(roster.full().personnel.map((person) => person.id)).toContain('archived-1');
		expect(roster.full({ status: 'all' }).personnel.map((person) => person.id)).toContain('archived-1');
		expect(roster.full({ status: 'active' }).personnel.map((person) => person.id)).not.toContain('archived-1');
		expect(roster.full({ status: 'archived' }).personnel.map((person) => person.id)).toEqual(['archived-1']);
	});

	it('searches rank, MOS, Duty Role, Group, and names consistently', () => {
		const roster = createRosterReadModel({ personnel, groups: [], pinnedGroupIds: [], fallbackGroupName: 'Test Unit' });

		expect(roster.full({ search: 'medic' }).personnel.map((person) => person.id)).toEqual(['bravo-1']);
		expect(roster.full({ search: 'alpha' }).personnel.map((person) => person.id)).toEqual(['alpha-1']);
		expect(roster.full({ search: 'Casey Adams' }).personnel.map((person) => person.id)).toEqual(['unassigned-1']);
	});

	it("orders Groups by the viewer's pins, then the Organization's Group order, then Unassigned", () => {
		const named = (id: string, name: string) => makePerson({ id, groupId: `group-${id}`, groupName: name });
		const roster = createRosterReadModel({
			personnel: [
				named('1', 'Alpha'),
				named('2', 'Bravo'),
				named('3', 'Charlie'),
				named('4', 'Delta'),
				named('5', 'Echo'),
				makePerson({ id: '6' })
			],
			pinnedGroupIds: ['group-4', 'group-2'],
			groups: [
				{ id: 'group-1', name: 'Alpha', sortOrder: 2 },
				{ id: 'group-2', name: 'Bravo', sortOrder: 1 },
				{ id: 'group-3', name: 'Charlie', sortOrder: 0 },
				{ id: 'group-4', name: 'Delta', sortOrder: 3 }
			]
		});

		expect(roster.full().personnelByGroup.map((group) => group.group)).toEqual([
			'Delta',
			'Bravo',
			'Charlie',
			'Alpha',
			'Echo',
			'Unassigned'
		]);
	});

	it('keeps two Groups that share a name as separate bands in catalog order', () => {
		const roster = createRosterReadModel({
			personnel: [
				makePerson({ id: 'first', groupId: 'group-1', groupName: 'Alpha' }),
				makePerson({ id: 'second', groupId: 'group-2', groupName: 'Alpha' })
			],
			groups: [
				{ id: 'group-1', name: 'Alpha', sortOrder: 1 },
				{ id: 'group-2', name: 'Alpha', sortOrder: 0 }
			],
			pinnedGroupIds: []
		});

		expect(
			roster.full().personnelByGroup.map((group) => [group.groupId, group.personnel.map((person) => person.id)])
		).toEqual([
			['group-2', ['second']],
			['group-1', ['first']]
		]);
	});

	it('keeps a pin on a renamed Group', () => {
		const roster = createRosterReadModel({
			personnel: [
				makePerson({ id: 'alpha-1', groupId: 'group-a', groupName: 'Alpha' }),
				makePerson({ id: 'bravo-1', groupId: 'group-b', groupName: 'Renamed Bravo' })
			],
			groups: [
				{ id: 'group-a', name: 'Alpha', sortOrder: 0 },
				{ id: 'group-b', name: 'Renamed Bravo', sortOrder: 1 }
			],
			pinnedGroupIds: ['group-b']
		});

		expect(roster.full().personnelByGroup.map((group) => group.groupId)).toEqual(['group-b', 'group-a']);
	});

	it('breaks equal sortOrder by name, then id', () => {
		const band = (groupId: string, name: string) => ({ groupId, name });
		const order = [band('c', 'Zulu'), band('a2', 'Alpha'), band('b', 'Alpha 2'), band('a1', 'Alpha')].sort(
			compareRosterBands({
				groups: [
					{ id: 'c', name: 'Zulu', sortOrder: 0 },
					{ id: 'b', name: 'Alpha 2', sortOrder: 0 },
					{ id: 'a2', name: 'Alpha', sortOrder: 0 },
					{ id: 'a1', name: 'Alpha', sortOrder: 0 }
				],
				pinnedGroupIds: []
			})
		);

		expect(order.map((entry) => entry.groupId)).toEqual(['a1', 'a2', 'b', 'c']);
	});

	it('orders by name when the Organization has no Groups catalog', () => {
		const order = [
			{ groupId: 'c', name: 'Charlie' },
			{ groupId: 'a', name: 'Alpha' },
			{ groupId: null, name: '' },
			{ groupId: 'b', name: 'Bravo' }
		].sort(compareRosterBands({ groups: [], pinnedGroupIds: [] }));

		expect(order.map((entry) => entry.name)).toEqual(['Alpha', 'Bravo', 'Charlie', '']);
	});
});

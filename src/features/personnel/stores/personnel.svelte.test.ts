import { describe, it, expect, vi, beforeEach } from 'vitest';
import { personnelRosterHydration, personnelStore, rosterStore } from './personnel.svelte';
import type { Personnel } from '$lib/types';

const mockPersonnel: Personnel[] = [
	{
		id: '1',
		firstName: 'John',
		lastName: 'Doe',
		rank: 'SGT',
		groupId: 'g1',
		groupName: 'Alpha',
		mos: '11B',
		clinicRole: 'Medic'
	},
	{
		id: '2',
		firstName: 'Jane',
		lastName: 'Smith',
		rank: 'PFC',
		groupId: 'g1',
		groupName: 'Alpha',
		mos: '68W',
		clinicRole: 'Provider'
	},
	{
		id: '3',
		firstName: 'Bob',
		lastName: 'Alpha',
		rank: 'SGT',
		groupId: 'g2',
		groupName: 'Bravo',
		mos: '11B',
		clinicRole: 'Medic'
	}
];

describe('personnelStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		personnelStore.load(structuredClone(mockPersonnel), 'org-1');
	});

	describe('getById', () => {
		it('should find personnel by ID', () => {
			expect(personnelStore.getById('1')?.lastName).toBe('Doe');
		});
	});

	describe('addBatchResults', () => {
		it('should append batch results to list', () => {
			const newPerson: Personnel = {
				id: '4',
				firstName: 'New',
				lastName: 'Person',
				rank: 'PV1',
				groupId: 'g1',
				groupName: 'Alpha',
				mos: '11B',
				clinicRole: 'Medic'
			};

			personnelStore.addBatchResults([newPerson]);
			expect(personnelStore.items).toHaveLength(4);
			expect(personnelStore.getById('4')?.lastName).toBe('Person');
			expect(rosterStore.readModel().full().getById('4')?.lastName).toBe('Person');
		});
	});

	describe('removeLocal', () => {
		it('should remove person from list locally without API call', () => {
			personnelStore.removeLocal('1');
			expect(personnelStore.items).toHaveLength(2);
			expect(personnelStore.getById('1')).toBeUndefined();
		});
	});

	describe('sortByRankAndName', () => {
		it('should sort by rank order then last name', () => {
			const sorted = personnelStore.sortByRankAndName();
			expect(sorted.map((p) => p.lastName)).toEqual(['Smith', 'Alpha', 'Doe']);
		});
	});

	describe('readModel', () => {
		it('exposes the explicit Roster Read Model over store items', () => {
			const view = personnelStore.readModel({ pinnedGroups: ['Bravo'] }).scoped({
				kind: 'groups',
				groupIds: ['g2']
			});

			expect(view.personnel.map((person) => person.id)).toEqual(['3']);
			expect(view.personnelByGroup.map((group) => group.group)).toEqual(['Bravo']);
		});
	});

	it('replaces the public roster when hydration switches Organizations', () => {
		expect(
			rosterStore
				.readModel()
				.full({ status: 'active' })
				.personnel.map((person) => person.id)
				.sort()
		).toEqual(['1', '2', '3']);

		personnelRosterHydration.load([{ ...mockPersonnel[0], id: 'other-org-person' }], 'org-2');

		expect(rosterStore.orgId).toBe('org-2');
		expect(
			rosterStore
				.readModel()
				.full({ status: 'active' })
				.personnel.map((person) => person.id)
		).toEqual(['other-org-person']);
		expect(rosterStore.items.some((person) => person.id === '1')).toBe(false);
	});
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trainingTypesStore } from './trainingTypes.svelte';
import type { TrainingType } from '../training.types';

const mockTypes: TrainingType[] = [
	{
		id: '1',
		name: 'CPR',
		sortOrder: 2,
		color: '#3b82f6',
		description: null,
		expirationMonths: 12,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: []
	},
	{
		id: '2',
		name: 'Weapons',
		sortOrder: 0,
		color: '#ef4444',
		description: null,
		expirationMonths: 6,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: []
	},
	{
		id: '3',
		name: 'PT Test',
		sortOrder: 1,
		color: '#22c55e',
		description: null,
		expirationMonths: null,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: []
	}
];

function stubFetch(response: unknown, status = 200) {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(response) })
	);
}

describe('trainingTypesStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		trainingTypesStore.load(structuredClone(mockTypes), 'org-1');
	});

	describe('list (sorted by sortOrder)', () => {
		it('returns items sorted by sortOrder ascending', () => {
			const names = trainingTypesStore.items.map((t) => t.name);
			expect(names).toEqual(['Weapons', 'PT Test', 'CPR']);
		});

		it('returns empty array before load', () => {
			trainingTypesStore.load([], 'org-2');
			expect(trainingTypesStore.items).toEqual([]);
		});
	});

	describe('load', () => {
		it('replaces existing items with new data', () => {
			trainingTypesStore.load([mockTypes[0]], 'org-2');
			expect(trainingTypesStore.items).toHaveLength(1);
			expect(trainingTypesStore.items[0].name).toBe('CPR');
		});
	});

	describe('getById', () => {
		it('finds an item by ID', () => {
			expect(trainingTypesStore.getById('1')?.name).toBe('CPR');
		});

		it('returns undefined for non-existent ID', () => {
			expect(trainingTypesStore.getById('nonexistent')).toBeUndefined();
		});
	});

	describe('add', () => {
		it('adds item and returns the server-created record', async () => {
			const created = {
				id: 'new-1',
				name: 'Land Nav',
				sortOrder: 3,
				color: '#000',
				description: null,
				expirationMonths: null,
				warningDaysYellow: 60,
				warningDaysOrange: 30,
				appliesToRoles: [],
				appliesToMos: [],
				appliesToRanks: [],
				excludedRoles: [],
				excludedMos: [],
				excludedRanks: [],
				expirationDateOnly: false,
				canBeExempted: false,
				exemptPersonnelIds: []
			};
			stubFetch(created);

			const result = await trainingTypesStore.add({
				name: 'Land Nav',
				sortOrder: 3,
				color: '#000',
				description: null,
				expirationMonths: null,
				warningDaysYellow: 60,
				warningDaysOrange: 30,
				appliesToRoles: [],
				appliesToMos: [],
				appliesToRanks: [],
				excludedRoles: [],
				excludedMos: [],
				excludedRanks: [],
				expirationDateOnly: false,
				canBeExempted: false,
				exemptPersonnelIds: []
			});

			expect(result).not.toBeNull();
			expect(result!.id).toBe('new-1');
			expect(trainingTypesStore.items.some((t) => t.id === 'new-1')).toBe(true);
		});
	});

	describe('update', () => {
		it('updates an existing item and returns true', async () => {
			stubFetch({ ...mockTypes[0], name: 'CPR/BLS' });

			const result = await trainingTypesStore.update('1', { name: 'CPR/BLS' });

			expect(result).toBe(true);
		});
	});

	describe('remove', () => {
		it('returns DeleteResult on success', async () => {
			stubFetch({});

			const result = await trainingTypesStore.remove('1');

			expect(result).toBe('deleted');
		});

		it('returns DeleteResult type, not boolean', async () => {
			stubFetch({});

			const result = await trainingTypesStore.remove('2');

			expect(typeof result).toBe('string');
		});
	});
});

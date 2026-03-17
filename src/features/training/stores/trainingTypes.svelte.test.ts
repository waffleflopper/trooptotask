import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trainingTypesStore } from './trainingTypes.svelte';
import type { TrainingType } from '../training.types';

const mockTypes: TrainingType[] = [
	{
		id: '1', name: 'CPR', sortOrder: 2, color: '#3b82f6',
		description: null, expirationMonths: 12, warningDaysYellow: 60,
		warningDaysOrange: 30, requiredForRoles: [], expirationDateOnly: false, canBeExempted: false, exemptPersonnelIds: []
	},
	{
		id: '2', name: 'Weapons', sortOrder: 0, color: '#ef4444',
		description: null, expirationMonths: 6, warningDaysYellow: 60,
		warningDaysOrange: 30, requiredForRoles: [], expirationDateOnly: false, canBeExempted: false, exemptPersonnelIds: []
	},
	{
		id: '3', name: 'PT Test', sortOrder: 1, color: '#22c55e',
		description: null, expirationMonths: null, warningDaysYellow: 60,
		warningDaysOrange: 30, requiredForRoles: [], expirationDateOnly: false, canBeExempted: false, exemptPersonnelIds: []
	}
];

describe('trainingTypesStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		trainingTypesStore.load(structuredClone(mockTypes), 'org-1');
	});

	describe('list (sorted)', () => {
		it('should return items sorted by sortOrder', () => {
			const names = trainingTypesStore.list.map((t) => t.name);
			expect(names).toEqual(['Weapons', 'PT Test', 'CPR']);
		});
	});

	describe('getById', () => {
		it('should find by ID', () => {
			expect(trainingTypesStore.getById('1')?.name).toBe('CPR');
		});
	});

	describe('remove', () => {
		it('should return DeleteResult', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) })
			);
			const result = await trainingTypesStore.remove('1');
			expect(result).toBe('deleted');
		});
	});
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { personnelTrainingsStore } from './personnelTrainings.svelte';
import type { PersonnelTraining } from '../training.types';

const mockTrainings: PersonnelTraining[] = [
	{
		id: '1',
		personnelId: 'p1',
		trainingTypeId: 'tt1',
		completionDate: '2026-01-15',
		expirationDate: '2027-01-15',
		notes: null,
		certificateUrl: null
	},
	{
		id: '2',
		personnelId: 'p1',
		trainingTypeId: 'tt2',
		completionDate: '2026-02-01',
		expirationDate: null,
		notes: null,
		certificateUrl: null
	},
	{
		id: '3',
		personnelId: 'p2',
		trainingTypeId: 'tt1',
		completionDate: '2026-01-20',
		expirationDate: '2027-01-20',
		notes: null,
		certificateUrl: null
	}
];

function mockFetch(response: unknown) {
	return vi.fn().mockResolvedValue({
		ok: true,
		status: 200,
		json: () => Promise.resolve(response)
	});
}

describe('personnelTrainingsStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		personnelTrainingsStore.load(structuredClone(mockTrainings), 'org-1');
	});

	describe('getById', () => {
		it('should find by ID', () => {
			expect(personnelTrainingsStore.getById('1')?.personnelId).toBe('p1');
		});
	});

	describe('getByPersonnelAndType', () => {
		it('should find by composite key', () => {
			const result = personnelTrainingsStore.getByPersonnelAndType('p1', 'tt1');
			expect(result?.id).toBe('1');
		});

		it('should return undefined for no match', () => {
			expect(personnelTrainingsStore.getByPersonnelAndType('p1', 'tt99')).toBeUndefined();
		});
	});

	describe('add (upsert)', () => {
		it('should replace existing entry with same composite key', async () => {
			const serverResult: PersonnelTraining = {
				id: 'new-1',
				personnelId: 'p1',
				trainingTypeId: 'tt1',
				completionDate: '2026-03-01',
				expirationDate: '2027-03-01',
				notes: null,
				certificateUrl: null
			};
			vi.stubGlobal('fetch', mockFetch(serverResult));

			await personnelTrainingsStore.add({
				personnelId: 'p1',
				trainingTypeId: 'tt1',
				completionDate: '2026-03-01',
				expirationDate: '2027-03-01',
				notes: null,
				certificateUrl: null
			});

			const byKey = personnelTrainingsStore.getByPersonnelAndType('p1', 'tt1');
			expect(byKey?.id).toBe('new-1');
			expect(personnelTrainingsStore.list).toHaveLength(3);
		});
	});

	describe('addBatchResults', () => {
		it('should merge inserted and updated records', () => {
			const updated: PersonnelTraining = { ...mockTrainings[0], completionDate: '2026-06-01' };
			const inserted: PersonnelTraining = {
				id: '4',
				personnelId: 'p3',
				trainingTypeId: 'tt1',
				completionDate: '2026-05-01',
				expirationDate: null,
				notes: null,
				certificateUrl: null
			};

			personnelTrainingsStore.addBatchResults([inserted], [updated]);
			expect(personnelTrainingsStore.list).toHaveLength(4);
			expect(personnelTrainingsStore.getById('1')?.completionDate).toBe('2026-06-01');
		});
	});

	describe('removeByPersonnelLocal', () => {
		it('should remove all trainings for a person', () => {
			personnelTrainingsStore.removeByPersonnelLocal('p1');
			expect(personnelTrainingsStore.list).toHaveLength(1);
			expect(personnelTrainingsStore.list[0].personnelId).toBe('p2');
		});
	});

	describe('removeByTrainingTypeLocal', () => {
		it('should remove all trainings for a type', () => {
			personnelTrainingsStore.removeByTrainingTypeLocal('tt1');
			expect(personnelTrainingsStore.list).toHaveLength(1);
			expect(personnelTrainingsStore.list[0].trainingTypeId).toBe('tt2');
		});
	});
});

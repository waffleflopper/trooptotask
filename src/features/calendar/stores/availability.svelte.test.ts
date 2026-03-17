import { describe, it, expect, vi, beforeEach } from 'vitest';
import { availabilityStore } from './availability.svelte';
import type { AvailabilityEntry } from '../calendar.types';

const mockEntries: AvailabilityEntry[] = [
	{ id: '1', personnelId: 'p1', statusTypeId: 'st1', startDate: '2026-03-01', endDate: '2026-03-05', note: null },
	{ id: '2', personnelId: 'p1', statusTypeId: 'st2', startDate: '2026-03-10', endDate: '2026-03-15', note: null },
	{ id: '3', personnelId: 'p2', statusTypeId: 'st1', startDate: '2026-03-01', endDate: '2026-03-03', note: null }
];

function mockFetch(response: unknown) {
	return vi.fn().mockResolvedValue({
		ok: true, status: 200, json: () => Promise.resolve(response)
	});
}

describe('availabilityStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		availabilityStore.load(structuredClone(mockEntries), 'org-1');
	});

	describe('getByPersonnel', () => {
		it('should return entries for a person', () => {
			expect(availabilityStore.getByPersonnel('p1')).toHaveLength(2);
		});
	});

	describe('getByDate', () => {
		it('should return entries covering a date', () => {
			const result = availabilityStore.getByDate(new Date(2026, 2, 2));
			expect(result).toHaveLength(2);
		});
	});

	describe('getByDateRange', () => {
		it('should return entries overlapping a date range', () => {
			const result = availabilityStore.getByDateRange(new Date(2026, 2, 1), new Date(2026, 2, 3));
			expect(result.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe('addBatch', () => {
		it('should add multiple entries optimistically', async () => {
			const inserted: AvailabilityEntry[] = [
				{ id: '4', personnelId: 'p3', statusTypeId: 'st1', startDate: '2026-04-01', endDate: '2026-04-05', note: null }
			];
			vi.stubGlobal('fetch', mockFetch({ inserted }));

			const result = await availabilityStore.addBatch([
				{ personnelId: 'p3', statusTypeId: 'st1', startDate: '2026-04-01', endDate: '2026-04-05', note: null }
			]);

			expect(result).toHaveLength(1);
			expect(availabilityStore.list).toHaveLength(4);
		});
	});

	describe('removeBatch', () => {
		it('should remove multiple entries optimistically', async () => {
			vi.stubGlobal('fetch', mockFetch({}));

			const result = await availabilityStore.removeBatch(['1', '3']);

			expect(result).toBe(true);
			expect(availabilityStore.list).toHaveLength(1);
		});
	});

	describe('removeByPersonnelLocal', () => {
		it('should remove entries for a person locally', () => {
			availabilityStore.removeByPersonnelLocal('p1');
			expect(availabilityStore.list).toHaveLength(1);
		});
	});

	describe('removeByStatusTypeLocal', () => {
		it('should remove entries for a status type locally', () => {
			availabilityStore.removeByStatusTypeLocal('st1');
			expect(availabilityStore.list).toHaveLength(1);
		});
	});

	describe('remove', () => {
		it('should return boolean', async () => {
			vi.stubGlobal('fetch', mockFetch({}));
			const result = await availabilityStore.remove('1');
			expect(result).toBe(true);
			expect(typeof result).toBe('boolean');
		});
	});
});

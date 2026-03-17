import { describe, it, expect, vi, beforeEach } from 'vitest';
import { statusTypesStore } from './statusTypes.svelte';

const mockTypes = [
	{ id: '1', name: 'Leave', color: '#22c55e', textColor: '#ffffff', iconName: null },
	{ id: '2', name: 'TDY', color: '#3b82f6', textColor: '#ffffff', iconName: null }
];

describe('statusTypesStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		statusTypesStore.load(structuredClone(mockTypes), 'org-1');
	});

	describe('getById', () => {
		it('should find a status type by ID', () => {
			const result = statusTypesStore.getById('1');
			expect(result).toEqual(mockTypes[0]);
		});

		it('should return undefined for non-existent ID', () => {
			const result = statusTypesStore.getById('nonexistent');
			expect(result).toBeUndefined();
		});
	});

	describe('remove', () => {
		it('should return boolean true on success', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) }));

			const result = await statusTypesStore.remove('1');

			expect(result).toBe(true);
			expect(typeof result).toBe('boolean');
		});
	});
});

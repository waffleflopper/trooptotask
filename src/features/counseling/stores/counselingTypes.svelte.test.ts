import { describe, it, expect, vi, beforeEach } from 'vitest';
import { counselingTypesStore } from './counselingTypes.svelte';
import type { CounselingType } from '../counseling.types';

const mockTypes: CounselingType[] = [
	{
		id: '1',
		name: 'Initial',
		description: null,
		templateContent: null,
		templateFilePath: null,
		recurrence: 'none',
		color: '#3b82f6',
		isFreeform: false,
		sortOrder: 0
	},
	{
		id: '2',
		name: 'Monthly',
		description: 'Monthly counseling',
		templateContent: null,
		templateFilePath: null,
		recurrence: 'monthly',
		color: '#22c55e',
		isFreeform: false,
		sortOrder: 1
	}
];

describe('counselingTypesStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		counselingTypesStore.load(structuredClone(mockTypes), 'org-1');
	});

	describe('getById', () => {
		it('should find a counseling type by ID', () => {
			expect(counselingTypesStore.getById('1')).toEqual(mockTypes[0]);
		});

		it('should return undefined for non-existent ID', () => {
			expect(counselingTypesStore.getById('nonexistent')).toBeUndefined();
		});
	});

	describe('remove', () => {
		it('should return DeleteResult on success', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) }));
			const result = await counselingTypesStore.remove('1');
			expect(result).toBe('deleted');
		});
	});
});

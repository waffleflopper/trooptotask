import { describe, it, expect, vi, beforeEach } from 'vitest';
import { counselingRecordsStore } from './counselingRecords.svelte';
import type { CounselingRecord } from '../counseling.types';

const mockRecords: CounselingRecord[] = [
	{
		id: '1',
		personnelId: 'p1',
		counselingTypeId: 'ct1',
		dateConducted: '2026-01-15',
		subject: 'Initial',
		keyPoints: null,
		planOfAction: null,
		notes: null,
		filePath: null,
		followUpDate: null,
		status: 'draft',
		counselorSigned: false,
		counselorSignedAt: null,
		soldierSigned: false,
		soldierSignedAt: null
	},
	{
		id: '2',
		personnelId: 'p1',
		counselingTypeId: 'ct2',
		dateConducted: '2026-02-15',
		subject: 'Follow-up',
		keyPoints: null,
		planOfAction: null,
		notes: null,
		filePath: null,
		followUpDate: null,
		status: 'completed',
		counselorSigned: true,
		counselorSignedAt: null,
		soldierSigned: false,
		soldierSignedAt: null
	},
	{
		id: '3',
		personnelId: 'p2',
		counselingTypeId: 'ct1',
		dateConducted: '2026-01-20',
		subject: 'Other person',
		keyPoints: null,
		planOfAction: null,
		notes: null,
		filePath: null,
		followUpDate: null,
		status: 'draft',
		counselorSigned: false,
		counselorSignedAt: null,
		soldierSigned: false,
		soldierSignedAt: null
	}
];

describe('counselingRecordsStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		counselingRecordsStore.load(structuredClone(mockRecords), 'org-1');
	});

	describe('getById', () => {
		it('should find a record by ID', () => {
			expect(counselingRecordsStore.getById('1')?.subject).toBe('Initial');
		});
	});

	describe('getByPersonnelId', () => {
		it('should return all records for a person', () => {
			const records = counselingRecordsStore.getByPersonnelId('p1');
			expect(records).toHaveLength(2);
		});

		it('should return empty for unknown person', () => {
			expect(counselingRecordsStore.getByPersonnelId('unknown')).toHaveLength(0);
		});
	});

	describe('removeByTypeLocal', () => {
		it('should remove all records with matching counseling type', () => {
			counselingRecordsStore.removeByTypeLocal('ct1');
			expect(counselingRecordsStore.list).toHaveLength(1);
			expect(counselingRecordsStore.list[0].id).toBe('2');
		});
	});
});

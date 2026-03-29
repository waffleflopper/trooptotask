import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockWriteFile, mockJsonToSheet, mockBookNew, mockBookAppendSheet } = vi.hoisted(() => {
	const mockWriteFile = vi.fn();
	const mockJsonToSheet = vi.fn(() => ({ '!cols': [] }));
	const mockBookNew = vi.fn(() => ({}));
	const mockBookAppendSheet = vi.fn();
	return { mockWriteFile, mockJsonToSheet, mockBookNew, mockBookAppendSheet };
});

vi.mock('xlsx', () => ({
	utils: {
		json_to_sheet: mockJsonToSheet,
		book_new: mockBookNew,
		book_append_sheet: mockBookAppendSheet
	},
	writeFile: mockWriteFile
}));

import { exportRatingScheme } from './ratingSchemeExport';
import type { Personnel } from '$lib/types';
import type { RatingSchemeEntry } from '../rating-scheme.types';

function makeEntry(overrides: Partial<RatingSchemeEntry> = {}): RatingSchemeEntry {
	return {
		id: '1',
		orgId: 'org1',
		groupId: 'g1',
		evalType: 'OER',
		reportType: 'annual',
		ratedPersonId: 'p1',
		raterId: null,
		raterPersonId: null,
		raterName: 'CPT Jones',
		seniorRaterId: null,
		seniorRaterPersonId: null,
		seniorRaterName: null,
		intermediateRaterId: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerId: null,
		reviewerPersonId: null,
		reviewerName: null,
		ratingPeriodStart: '2026-01-01',
		ratingPeriodEnd: '2026-12-31',
		status: 'active',
		workflowStatus: null,
		notes: null,
		createdAt: '2026-01-01',
		updatedAt: '2026-01-01',
		...overrides
	} as RatingSchemeEntry;
}

function makePersonnel(): Personnel[] {
	return [
		{
			id: 'p1',
			rank: 'CPT',
			lastName: 'Smith',
			firstName: 'Jane',
			groupName: 'HQ',
			groupId: 'g1'
		} as Personnel
	];
}

describe('exportRatingScheme', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns a promise (is async)', async () => {
		const result = exportRatingScheme([makeEntry()], makePersonnel());
		expect(result).toBeInstanceOf(Promise);
		await result;
	});

	it('creates a workbook and saves it as xlsx', async () => {
		await exportRatingScheme([makeEntry()], makePersonnel());

		expect(mockJsonToSheet).toHaveBeenCalled();
		expect(mockBookNew).toHaveBeenCalled();
		expect(mockBookAppendSheet).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'Rating Scheme');
		expect(mockWriteFile).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('rating-scheme-'));
	});
});

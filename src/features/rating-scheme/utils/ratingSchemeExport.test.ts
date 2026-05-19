// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockAddWorksheet, mockAddRows, mockWriteBuffer } = vi.hoisted(() => {
	const mockAddRows = vi.fn();
	const mockGetRow = vi.fn(() => ({}));
	const mockAddWorksheet = vi.fn(() => ({
		addRows: mockAddRows,
		getRow: mockGetRow,
		columns: []
	}));
	const mockWriteBuffer = vi.fn(async () => new ArrayBuffer(8));
	return { mockAddWorksheet, mockAddRows, mockGetRow, mockWriteBuffer };
});

vi.mock('exceljs', () => ({
	Workbook: vi.fn(() => ({
		addWorksheet: mockAddWorksheet,
		xlsx: {
			writeBuffer: mockWriteBuffer
		}
	}))
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
	let clickedAnchor: HTMLAnchorElement | null;

	beforeEach(() => {
		vi.clearAllMocks();
		clickedAnchor = null;
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:rating-scheme');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const appendChild = document.body.appendChild.bind(document.body);
		vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
			if (node instanceof HTMLAnchorElement) clickedAnchor = node;
			return appendChild(node);
		});
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns a promise (is async)', async () => {
		const result = exportRatingScheme([makeEntry()], makePersonnel());
		expect(result).toBeInstanceOf(Promise);
		await result;
	});

	it('creates a workbook and saves it as xlsx', async () => {
		await exportRatingScheme([makeEntry()], makePersonnel());

		expect(mockAddWorksheet).toHaveBeenCalledWith('Rating Scheme');
		expect(mockAddRows).toHaveBeenCalledWith([
			expect.objectContaining({
				'Eval Type': 'OER',
				'Rated Individual': 'CPT Smith, Jane',
				Rater: 'CPT Jones'
			})
		]);
		expect(mockWriteBuffer).toHaveBeenCalled();
		expect(clickedAnchor?.download).toContain('rating-scheme-');
		expect(clickedAnchor?.download).toContain('.xlsx');
	});
});

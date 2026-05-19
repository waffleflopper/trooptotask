// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { buildRatingSchemeWorkbook, exportRatingScheme } from './ratingSchemeExport';
import type { Personnel } from '$lib/types';
import type { RatingSchemeEntry } from '../rating-scheme.types';
import { WORKBOOK_MIME_TYPE } from '$lib/export/workbook';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

function toWorkbookBuffer(buffer: ArrayBuffer): WorkbookLoadBuffer {
	return buffer as WorkbookLoadBuffer;
}

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

async function parseWorkbookFromBuffer(buffer: ExcelJS.Buffer): Promise<ExcelJS.Workbook> {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(buffer as WorkbookLoadBuffer);
	return workbook;
}

describe('buildRatingSchemeWorkbook', () => {
	it('preserves the rating scheme columns and row content', async () => {
		const workbook = await buildRatingSchemeWorkbook([makeEntry()], makePersonnel());
		const parsed = await parseWorkbookFromBuffer(await workbook.xlsx.writeBuffer());
		const sheet = parsed.getWorksheet('Rating Scheme')!;

		expect(sheet.getRow(1).values).toEqual([
			undefined,
			'Eval Type',
			'Report Type',
			'Rated Individual',
			'Rank',
			'Rater',
			'Senior Rater',
			'Intermediate Rater',
			'Reviewer',
			'Rating Period Start',
			'Thru Date',
			'Days Until Due',
			'Due Status',
			'Status',
			'Workflow Status',
			'Notes'
		]);
		expect(sheet.getCell('A2').value).toBe('OER');
		expect(sheet.getCell('B2').value).toBe('annual');
		expect(sheet.getCell('C2').value).toBe('CPT Smith, Jane');
		expect(sheet.getCell('E2').value).toBe('CPT Jones');
		expect(sheet.getCell('F2').value).toBeNull();
	});
});

describe('exportRatingScheme', () => {
	let clickedAnchor: HTMLAnchorElement | null;
	let exportedBlob: Blob | null;

	beforeEach(() => {
		clickedAnchor = null;
		exportedBlob = null;
		vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
			exportedBlob = blob as Blob;
			return 'blob:rating-scheme';
		});
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

	it('downloads the shared-workbook xlsx blob', async () => {
		await exportRatingScheme([makeEntry()], makePersonnel());

		expect(exportedBlob?.type).toBe(WORKBOOK_MIME_TYPE);
		expect(clickedAnchor?.download).toContain('rating-scheme-');
		expect(clickedAnchor?.download).toContain('.xlsx');

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(toWorkbookBuffer(await exportedBlob!.arrayBuffer()));
		const sheet = workbook.getWorksheet('Rating Scheme')!;
		expect(sheet.getCell('C2').value).toBe('CPT Smith, Jane');
		expect(sheet.getCell('E2').value).toBe('CPT Jones');
	});
});

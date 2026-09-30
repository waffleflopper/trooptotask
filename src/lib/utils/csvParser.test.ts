// @vitest-environment happy-dom

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseCSVText, parseDateString, parseFile } from './csvParser';

describe('parseCSVText', () => {
	it('returns a promise (is async)', async () => {
		const result = parseCSVText('Name,Rank\nDoe,SGT');
		expect(result).toBeInstanceOf(Promise);
		await result;
	});

	it('parses basic CSV', async () => {
		const result = await parseCSVText('Name,Rank\nDoe,SGT\nSmith,SPC');
		expect(result).toHaveLength(3);
		expect(result[0]).toEqual(['Name', 'Rank']);
		expect(result[1]).toEqual(['Doe', 'SGT']);
	});

	it('trims whitespace from cells', async () => {
		const result = await parseCSVText('  Name , Rank \n Doe , SGT ');
		expect(result[0]).toEqual(['Name', 'Rank']);
		expect(result[1]).toEqual(['Doe', 'SGT']);
	});

	it('filters out empty rows', async () => {
		const result = await parseCSVText('Name,Rank\n\nDoe,SGT\n\n');
		expect(result).toHaveLength(2);
	});

	it('keeps quoted commas in a single cell', async () => {
		const result = await parseCSVText('Name,Notes\nDoe,"Has, comma"');
		expect(result[1]).toEqual(['Doe', 'Has, comma']);
	});
});

describe('parseFile', () => {
	it('parses xlsx files without the legacy xls parser', async () => {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet('Personnel');
		sheet.addRows([
			['Name', 'Rank'],
			['Doe', 'SGT']
		]);

		const buffer = await workbook.xlsx.writeBuffer();
		const file = new File([buffer], 'personnel.xlsx', {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		});

		await expect(parseFile(file)).resolves.toEqual([
			['Name', 'Rank'],
			['Doe', 'SGT']
		]);
	});

	it('preserves xlsx Date cells as UTC date-only values', async () => {
		const originalTimezone = process.env.TZ;
		process.env.TZ = 'America/Los_Angeles';
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet('Training');
		sheet.addRows([
			['Name', 'Completed'],
			['Doe', new Date('2026-01-01T00:00:00.000Z')]
		]);

		try {
			const buffer = await workbook.xlsx.writeBuffer();
			const file = new File([buffer], 'training.xlsx', {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			});

			await expect(parseFile(file)).resolves.toEqual([
				['Name', 'Completed'],
				['Doe', '2026-01-01']
			]);
		} finally {
			if (originalTimezone === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = originalTimezone;
			}
		}
	});
});

describe('parseDateString', () => {
	it('parses ISO format YYYY-MM-DD', () => {
		expect(parseDateString('2026-03-13')).toBe('2026-03-13');
	});

	it('parses US format MM/DD/YYYY', () => {
		expect(parseDateString('3/13/2026')).toBe('2026-03-13');
	});

	it('parses US format with leading zeros', () => {
		expect(parseDateString('03/13/2026')).toBe('2026-03-13');
	});

	it('returns null for invalid dates', () => {
		expect(parseDateString('not-a-date')).toBeNull();
	});

	it('returns null for empty string', () => {
		expect(parseDateString('')).toBeNull();
	});

	it('parses Excel serial dates independent of timezone', () => {
		expect(parseDateString('25569')).toBe('1970-01-01');
		expect(parseDateString('45292')).toBe('2024-01-01');
		expect(parseDateString('60000')).toBe('2064-04-08');
	});

	it('rejects integers outside the Excel serial window', () => {
		expect(parseDateString('25568')).toBeNull();
		expect(parseDateString('60001')).toBeNull();
	});
});

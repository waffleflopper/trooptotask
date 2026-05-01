// @vitest-environment happy-dom

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseCSVText, parseTrainingStatus, parseDateString, parseFile } from './csvParser';

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
});

describe('parseTrainingStatus', () => {
	it('recognizes exempt values', () => {
		expect(parseTrainingStatus('exempt').type).toBe('exempt');
		expect(parseTrainingStatus('Exempted').type).toBe('exempt');
		expect(parseTrainingStatus('E').type).toBe('exempt');
	});

	it('recognizes completed values', () => {
		expect(parseTrainingStatus('yes').type).toBe('completed');
		expect(parseTrainingStatus('Y').type).toBe('completed');
		expect(parseTrainingStatus('done').type).toBe('completed');
		expect(parseTrainingStatus('x').type).toBe('completed');
	});

	it('sets today as date for completed values', () => {
		const result = parseTrainingStatus('yes');
		expect(result.date).toBe(new Date().toISOString().slice(0, 10));
	});

	it('recognizes skip values', () => {
		expect(parseTrainingStatus('no').type).toBe('skip');
		expect(parseTrainingStatus('').type).toBe('skip');
		expect(parseTrainingStatus('pending').type).toBe('skip');
	});

	it('parses date values', () => {
		const result = parseTrainingStatus('2026-03-13');
		expect(result.type).toBe('date');
		expect(result.date).toBe('2026-03-13');
	});

	it('returns invalid for unrecognized values', () => {
		expect(parseTrainingStatus('foobar').type).toBe('invalid');
	});

	it('preserves raw value', () => {
		expect(parseTrainingStatus('  Yes  ').raw).toBe('  Yes  ');
	});
});

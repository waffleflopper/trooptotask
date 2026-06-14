// src/lib/utils/csvParser.ts
import type ExcelJS from 'exceljs';
import { resolveExcelWorkbookConstructor } from '$lib/utils/excelWorkbook';

/**
 * Parse CSV text into a 2D array of strings.
 * Handles comma-separated values with basic trimming.
 */
export async function parseCSVText(text: string): Promise<string[][]> {
	return parseDelimitedText(text);
}

/**
 * Parse an uploaded file (Excel or CSV) into a 2D array of strings.
 * Returns a Promise because FileReader is async.
 */
export function parseFile(file: File): Promise<string[][]> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = async (e) => {
			try {
				const data = e.target?.result;
				if (typeof data === 'string') {
					resolve(parseDelimitedText(data));
					return;
				}

				if (!(data instanceof ArrayBuffer)) {
					reject(new Error('Failed to read file'));
					return;
				}

				const rows = await parseXlsxBuffer(data);
				resolve(rows);
			} catch (err) {
				reject(err);
			}
		};
		reader.onerror = () => reject(new Error('Failed to read file'));
		if (isCsvFile(file)) {
			reader.readAsText(file);
		} else {
			reader.readAsArrayBuffer(file);
		}
	});
}

function isCsvFile(file: File): boolean {
	return file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv');
}

async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<string[][]> {
	const ExcelJS = await import('exceljs');
	const WorkbookConstructor = resolveExcelWorkbookConstructor<ExcelJS.Workbook>(ExcelJS);
	const workbook = new WorkbookConstructor();
	await workbook.xlsx.load(buffer);
	const sheet = workbook.worksheets[0];
	if (!sheet) return [];

	const rows: string[][] = [];
	sheet.eachRow({ includeEmpty: true }, (row) => {
		const values: string[] = [];
		for (let index = 1; index <= row.cellCount; index += 1) {
			values.push(cellToString(row.getCell(index).value));
		}
		if (values.some((cell) => cell.length > 0)) {
			rows.push(values);
		}
	});

	return rows;
}

function cellToString(value: unknown): string {
	if (value == null) return '';
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	if (typeof value === 'object') {
		if ('text' in value && typeof value.text === 'string') return value.text.trim();
		if ('result' in value) return cellToString(value.result);
		if ('richText' in value && Array.isArray(value.richText)) {
			return value.richText
				.map((part) => (typeof part?.text === 'string' ? part.text : ''))
				.join('')
				.trim();
		}
	}
	return String(value).trim();
}

function parseDelimitedText(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let inQuotes = false;

	function finishCell() {
		row.push(cell.trim());
		cell = '';
	}

	function finishRow() {
		finishCell();
		if (row.some((value) => value.length > 0)) rows.push(row);
		row = [];
	}

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		const next = text[index + 1];

		if (char === '"') {
			if (inQuotes && next === '"') {
				cell += '"';
				index += 1;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if (char === ',' && !inQuotes) {
			finishCell();
			continue;
		}

		if ((char === '\n' || char === '\r') && !inQuotes) {
			if (char === '\r' && next === '\n') index += 1;
			finishRow();
			continue;
		}

		cell += char;
	}

	finishRow();

	return rows;
}

/**
 * Parse a training status/date value.
 * Returns { type, date } where type is 'date' | 'completed' | 'exempt' | 'skip' | 'invalid'.
 */
export function parseTrainingStatus(value: string): {
	type: 'date' | 'completed' | 'exempt' | 'skip' | 'invalid';
	date: string | null;
	raw: string;
} {
	const raw = value;
	const v = value.trim().toLowerCase();

	// Exempt values
	if (['exempt', 'exempted', 'e'].includes(v)) {
		return { type: 'exempt', date: null, raw };
	}

	// Yes/completed values → completed today
	if (['yes', 'y', 'true', '1', 'complete', 'completed', 'done', 'x'].includes(v)) {
		const today = new Date().toISOString().slice(0, 10);
		return { type: 'completed', date: today, raw };
	}

	// No/skip values
	if (['no', 'n', 'false', '0', 'incomplete', 'pending', ''].includes(v)) {
		return { type: 'skip', date: null, raw };
	}

	// Try date formats
	const date = parseDateString(value);
	if (date) {
		return { type: 'date', date, raw };
	}

	return { type: 'invalid', date: null, raw };
}

/**
 * Parse a date string in various formats to YYYY-MM-DD.
 */
export function parseDateString(str: string): string | null {
	const trimmed = str.trim();

	// ISO: YYYY-MM-DD
	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
		const d = new Date(trimmed + 'T00:00:00');
		return isNaN(d.getTime()) ? null : trimmed;
	}

	// US: MM/DD/YYYY
	const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (usMatch) {
		const [, mm, dd, yyyy] = usMatch;
		const d = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00`);
		return isNaN(d.getTime()) ? null : `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
	}

	// Excel serial number
	if (/^\d+$/.test(trimmed)) {
		const serial = parseInt(trimmed, 10);
		if (serial >= 25569 && serial <= 60000) {
			// Excel epoch: Jan 1, 1900, with the leap year bug (UTC to keep imports timezone-independent)
			const ms = Date.UTC(1900, 0, 1) + (serial - 2) * 86400000;
			const d = new Date(ms);
			if (!isNaN(d.getTime())) {
				return d.toISOString().slice(0, 10);
			}
		}
		return null;
	}

	// Fallback: JS Date.parse (use local date parts to avoid UTC offset shifting the date)
	const d = new Date(trimmed);
	if (!isNaN(d.getTime())) {
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		return `${yyyy}-${mm}-${dd}`;
	}

	return null;
}

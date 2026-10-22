import type ExcelJS from 'exceljs';
import { createWorkbook } from '$lib/utils/workbook';
import type { ColumnSplitter, ImportColumns, ImportReference, PivotSpec } from './types';
import { normalizeHeader } from './values';

export const ACCEPTED_EXTENSIONS = ['.xlsx', '.csv', '.tsv'] as const;
export const HEADER_SCAN_ROWS = 15;

export interface SheetGrid {
	index: number;
	name: string;
	hidden: boolean;
	rows: readonly (readonly string[])[];
}

export interface LoadedFile {
	name: string;
	date1904?: boolean;
	sheets: readonly SheetGrid[];
}

export type ReadFileResult = { kind: 'loaded'; file: LoadedFile } | { kind: 'rejected'; message: string };
export type HeaderKey = string & { readonly __headerKey: true };
export type ColumnTarget =
	| { kind: 'field'; field: string }
	| { kind: 'split'; splitter: number }
	| { kind: 'pivot' }
	| { kind: 'ignore' };

export interface SheetLayout {
	included: boolean;
	headerRow: number | null;
	signature: string;
	reason: string | null;
}

export interface Layout {
	sheets: readonly SheetLayout[];
	columns: ReadonlyMap<HeaderKey, ColumnTarget>;
}

export interface ImportSchema<C extends ImportColumns> {
	columns: C;
	splitters?: readonly ColumnSplitter<C>[];
	pivot?: PivotSpec<C>;
	references: Record<string, ImportReference<C, unknown>>;
}

export function headerKey(cell: string): HeaderKey {
	return normalizeHeader(cell) as HeaderKey;
}

function cellText(value: ExcelJS.CellValue): string {
	if (value === null || value === undefined) return '';
	if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : '';
	if (typeof value !== 'object') return String(value);
	if ('result' in value) return cellText(value.result);
	if ('richText' in value) return value.richText.map((part) => part.text).join('');
	if ('text' in value) return value.text;
	if ('error' in value) return value.error;
	return '';
}

export function parseDelimited(text: string, delimiter: ',' | '\t'): readonly (readonly string[])[] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	const source = text.replace(/^\uFEFF/, '');
	for (let i = 0; i < source.length; i++) {
		const char = source[i];
		if (char === '"') {
			if (quoted && source[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (quoted || cell === '') quoted = !quoted;
			else cell += char;
		} else if (!quoted && char === delimiter) {
			row.push(cell);
			cell = '';
		} else if (!quoted && (char === '\n' || char === '\r')) {
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
			if (char === '\r' && source[i + 1] === '\n') i++;
		} else cell += char;
	}
	if (quoted) throw new Error('A quoted cell is missing its closing quote.');
	if (cell || row.length) {
		row.push(cell);
		rows.push(row);
	}
	while (rows.length && rows[rows.length - 1].every((value) => !value.trim())) rows.pop();
	return rows;
}

export async function readImportFile(file: File): Promise<ReadFileResult> {
	const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
	if (!ACCEPTED_EXTENSIONS.some((accepted) => accepted === extension)) {
		return { kind: 'rejected', message: 'Choose an .xlsx, .csv, or .tsv file.' };
	}
	try {
		if (extension !== '.xlsx') {
			const text = await file.text();
			const firstLine = text.split(/\r?\n/, 1)[0];
			const delimiter = extension === '.tsv' || (!firstLine.includes(',') && firstLine.includes('\t')) ? '\t' : ',';
			return {
				kind: 'loaded',
				file: {
					name: file.name,
					date1904: false,
					sheets: [
						{ index: 0, name: file.name.replace(/\.[^.]+$/, ''), hidden: false, rows: parseDelimited(text, delimiter) }
					]
				}
			};
		}
		const workbook = await createWorkbook();
		await workbook.xlsx.load(await file.arrayBuffer());
		const sheets = workbook.worksheets.map((sheet, index): SheetGrid => {
			const rows: string[][] = [];
			for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) {
				const row = sheet.getRow(rowNumber);
				const cells: string[] = [];
				for (let column = 1; column <= row.cellCount; column++) cells.push(cellText(row.getCell(column).value));
				while (cells.length && cells[cells.length - 1] === '') cells.pop();
				rows.push(cells);
			}
			while (rows.length && rows[rows.length - 1].every((value) => !value.trim())) rows.pop();
			return { index, name: sheet.name, hidden: sheet.state !== 'visible', rows };
		});
		return { kind: 'loaded', file: { name: file.name, date1904: workbook.properties.date1904 === true, sheets } };
	} catch (error) {
		return { kind: 'rejected', message: error instanceof Error ? error.message : 'The file could not be read.' };
	}
}

function directTarget<C extends ImportColumns>(cell: string, lane: ImportSchema<C>): ColumnTarget | null {
	const key = headerKey(cell);
	if (!key) return null;
	for (const [field, column] of Object.entries(lane.columns)) {
		if ([field, column.label, ...column.aliases].some((alias) => headerKey(alias) === key))
			return { kind: 'field', field };
	}
	const splitter = lane.splitters?.findIndex((item) => item.aliases.some((alias) => headerKey(alias) === key)) ?? -1;
	if (splitter >= 0) return { kind: 'split', splitter };
	if (lane.pivot) {
		for (const reference of Object.values(lane.references)) {
			if (!reference.reads.includes(lane.pivot.field)) continue;
			const raw: Partial<Record<keyof C & string, string>> = {};
			raw[lane.pivot.field] = cell.trim();
			const lookup = reference.key(raw);
			if (lookup && reference.find(lookup.key).kind === 'one') return { kind: 'pivot' };
		}
	}
	return null;
}

export function fieldsForTargets<C extends ImportColumns>(
	targets: readonly ColumnTarget[],
	lane: ImportSchema<C>
): Set<string> {
	const fields = new Set<string>();
	for (const target of targets) {
		if (target.kind === 'field') fields.add(target.field);
		if (target.kind === 'split') for (const field of lane.splitters?.[target.splitter]?.fills ?? []) fields.add(field);
		if (target.kind === 'pivot' && lane.pivot) {
			fields.add(lane.pivot.field);
			fields.add(lane.pivot.valueField);
		}
	}
	return fields;
}

function headerSignature(cells: readonly string[]): string {
	return JSON.stringify(cells.map(headerKey).filter(Boolean).sort());
}

export function detectLayout<C extends ImportColumns>(file: LoadedFile, lane: ImportSchema<C>): Layout {
	const requiredCount = Object.values(lane.columns).filter((column) => column.required).length;
	const detected = file.sheets.map((sheet): SheetLayout => {
		let best: { row: number; score: number } | null = null;
		for (let row = 0; row < Math.min(HEADER_SCAN_ROWS, sheet.rows.length); row++) {
			const matched = sheet.rows[row].map((cell) => ({ key: headerKey(cell), target: directTarget(cell, lane) }));
			const targets = matched.flatMap((cell) => cell.target ?? []);
			const evidence = new Set(matched.filter((cell) => cell.target).map((cell) => cell.key));
			if (evidence.size < Math.min(2, Object.keys(lane.columns).length)) continue;
			const fields = fieldsForTargets(targets, lane);
			const required = [...fields].filter((field) => lane.columns[field]?.required).length;
			if (
				fields.size < Math.min(2, Object.keys(lane.columns).length) ||
				(requiredCount > 0 && required < Math.min(2, requiredCount))
			)
				continue;
			const score = fields.size + required * 2;
			if (!best || score > best.score) best = { row, score };
		}
		return {
			included: false,
			headerRow: best?.row ?? null,
			signature: best ? headerSignature(sheet.rows[best.row]) : '',
			reason: sheet.hidden ? 'Hidden in Excel' : best ? null : 'No recognizable header in the first 15 rows'
		};
	});
	let primary = -1;
	let largest = -1;
	for (let i = 0; i < detected.length; i++) {
		const sheet = detected[i];
		if (file.sheets[i].hidden || sheet.headerRow === null) continue;
		const dataRows = file.sheets[i].rows
			.slice(sheet.headerRow + 1)
			.filter((row) => row.some((cell) => cell.trim())).length;
		if (dataRows > largest) {
			primary = i;
			largest = dataRows;
		}
	}
	const sheets = detected.map((sheet, i) => {
		const matches = primary >= 0 && sheet.headerRow !== null && sheet.signature === detected[primary].signature;
		return {
			...sheet,
			included: matches && !file.sheets[i].hidden,
			reason: sheet.reason ?? (matches ? null : 'Different columns from the main sheets')
		};
	});
	return extendColumnTargets({ sheets, columns: new Map() }, file, lane);
}

export function extendColumnTargets<C extends ImportColumns>(
	layout: Layout,
	file: LoadedFile,
	lane: ImportSchema<C>
): Layout {
	const columns = new Map(layout.columns);
	for (let i = 0; i < layout.sheets.length; i++) {
		const sheet = layout.sheets[i];
		if (!sheet.included || sheet.headerRow === null) continue;
		const cells = file.sheets[i].rows[sheet.headerRow] ?? [];
		const detected = cells.map((cell) => directTarget(cell, lane));
		const longFormat =
			lane.pivot && detected.some((target) => target?.kind === 'field' && target.field === lane.pivot?.field);
		const claimed = fieldsForTargets(
			cells.flatMap((cell) => {
				const target = columns.get(headerKey(cell));
				return target && target.kind !== 'pivot' ? [target] : [];
			}),
			lane
		);
		for (let column = 0; column < cells.length; column++) {
			const key = headerKey(cells[column]);
			if (!key || columns.has(key)) continue;
			const target: ColumnTarget =
				detected[column] ?? (lane.pivot && !longFormat && key !== 'reason' ? { kind: 'pivot' } : { kind: 'ignore' });
			const fields = target.kind === 'pivot' ? new Set<string>() : fieldsForTargets([target], lane);
			if ([...fields].some((field) => claimed.has(field))) columns.set(key, { kind: 'ignore' });
			else {
				columns.set(key, target);
				for (const field of fields) claimed.add(field);
			}
		}
	}
	return { ...layout, columns };
}

export function duplicateMappedFields<C extends ImportColumns>(
	layout: Layout,
	file: LoadedFile,
	lane: ImportSchema<C>
): readonly { label: string; sheet: string }[] {
	const duplicates: { label: string; sheet: string }[] = [];
	for (let i = 0; i < layout.sheets.length; i++) {
		const settings = layout.sheets[i];
		if (!settings.included || settings.headerRow === null) continue;
		const fields = new Set<string>();
		const repeated = new Set<string>();
		for (const header of file.sheets[i].rows[settings.headerRow] ?? []) {
			const target = layout.columns.get(headerKey(header));
			if (!target || target.kind === 'pivot') continue;
			for (const field of fieldsForTargets([target], lane)) {
				if (fields.has(field)) repeated.add(field);
				fields.add(field);
			}
		}
		for (const field of repeated) duplicates.push({ label: lane.columns[field].label, sheet: file.sheets[i].name });
	}
	return duplicates;
}

export function missingRequiredFields<C extends ImportColumns>(
	layout: Layout,
	file: LoadedFile,
	lane: ImportSchema<C>
): readonly { field: keyof C & string; label: string }[] {
	const missing = new Map<keyof C & string, string>();
	for (let i = 0; i < layout.sheets.length; i++) {
		const sheet = layout.sheets[i];
		if (!sheet.included) continue;
		const headers = sheet.headerRow === null ? [] : (file.sheets[i].rows[sheet.headerRow] ?? []);
		const fields = fieldsForTargets(
			headers.flatMap((cell) => layout.columns.get(headerKey(cell)) ?? []),
			lane
		);
		for (const field in lane.columns) {
			const column = lane.columns[field];
			if (column.required && !fields.has(field)) missing.set(field, column.label);
		}
	}
	return [...missing].map(([field, label]) => ({ field, label }));
}

import { createWorkbook, styleHeaderRow, workbookBlob, type Workbook, type Worksheet } from '$lib/utils/workbook';
import { downloadBlob } from '$lib/utils/downloadBlob';
import type { ColumnSplitter, ImportColumns } from './types';
import type { Receipt } from './commit';
import type { Layout, LoadedFile } from './workbookSource';
import { headerKey, targetsForHeaders } from './workbookSource';

function formatCellsAsText(sheet: Worksheet): void {
	sheet.eachRow((row) =>
		row.eachCell((cell) => {
			cell.numFmt = '@';
		})
	);
}

export async function buildTemplate(lane: { columns: ImportColumns }): Promise<Workbook> {
	const workbook = await createWorkbook();
	const sheet = workbook.addWorksheet('Import');
	sheet.addRow(Object.values(lane.columns).map((column) => column.label));
	sheet.addRow(Object.values(lane.columns).map((column) => column.example ?? ''));
	formatCellsAsText(sheet);
	styleHeaderRow(sheet);
	sheet.views = [{ state: 'frozen', ySplit: 1 }];
	return workbook;
}

export async function buildNotImported(
	file: LoadedFile,
	layout: Layout,
	receipt: Receipt,
	splitters: readonly ColumnSplitter<ImportColumns>[] = []
): Promise<Workbook> {
	const workbook = await createWorkbook();
	workbook.properties.date1904 = file.date1904 === true;
	for (let index = 0; index < file.sheets.length; index++) {
		const source = file.sheets[index];
		const items = receipt.notImported.filter((item) => item.row.sheetIndex === source.index);
		if (!items.length) continue;
		const headerIndex = layout.sheets[index]?.headerRow;
		const headers = headerIndex === null || headerIndex === undefined ? [] : (source.rows[headerIndex] ?? []);
		const width = Math.max(headers.length, ...items.map((item) => item.row.cells.length));
		const sheet = workbook.addWorksheet(source.name.replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || `Sheet ${index + 1}`);
		sheet.addRow([...Array.from({ length: width }, (_, column) => headers[column] ?? ''), 'Reason']);
		const pivotColumns = headers.flatMap((header, column) =>
			layout.columns.get(headerKey(header))?.kind === 'pivot' ? [column] : []
		);
		const targets = targetsForHeaders(headers, layout.columns);
		const fieldColumns = targets.flatMap((target, column) =>
			target.kind === 'field' ? [[column, target.field] as const] : []
		);
		const splitColumns = targets.flatMap((target, column) => {
			const splitter = target.kind === 'split' ? splitters[target.splitter] : undefined;
			return splitter?.join ? [[column, splitter] as const] : [];
		});
		const physicalRows = new Map<number, { cells: string[]; reasons: Set<string> }>();
		for (const item of items) {
			let row = physicalRows.get(item.row.rowNumber);
			if (!row) {
				row = { cells: [...item.row.cells], reasons: new Set() };
				for (const [column, field] of fieldColumns) {
					const reviewed = item.row.raw[field];
					if (reviewed !== undefined && reviewed !== (row.cells[column] ?? '').trim()) row.cells[column] = reviewed;
				}
				for (const [column, splitter] of splitColumns) {
					const original = splitter.split(row.cells[column] ?? '') ?? {};
					const edited = splitter.fills.some((field) => (item.row.raw[field] ?? '') !== (original[field] ?? ''));
					if (edited) row.cells[column] = splitter.join?.(item.row.raw) ?? row.cells[column];
				}
				if (item.row.pivotColumn !== undefined) for (const column of pivotColumns) row.cells[column] = '';
				physicalRows.set(item.row.rowNumber, row);
			}
			if (item.row.pivotColumn !== undefined)
				row.cells[item.row.pivotColumn] = item.row.pivot
					? (item.row.raw[item.row.pivot.valueField] ?? '')
					: (item.row.cells[item.row.pivotColumn] ?? '');
			row.reasons.add(item.row.pivotHeader ? `${item.row.pivotHeader}: ${item.reason}` : item.reason);
		}
		for (const row of physicalRows.values())
			sheet.addRow([
				...Array.from({ length: width }, (_, column) => row.cells[column] ?? ''),
				[...row.reasons].join('; ')
			]);
		formatCellsAsText(sheet);
		styleHeaderRow(sheet);
		sheet.views = [{ state: 'frozen', ySplit: 1 }];
	}
	return workbook;
}

export async function downloadTemplate(
	lane: { id: string; columns: ImportColumns },
	isCurrent: () => boolean = () => true
): Promise<void> {
	const workbook = await buildTemplate(lane);
	if (!isCurrent()) return;
	const blob = await workbookBlob(workbook);
	if (!isCurrent()) return;
	downloadBlob(blob, `${lane.id}-template.xlsx`);
}

export async function downloadNotImported(
	file: LoadedFile,
	layout: Layout,
	receipt: Receipt,
	splitters: readonly ColumnSplitter<ImportColumns>[],
	isCurrent: () => boolean = () => true
): Promise<void> {
	const workbook = await buildNotImported(file, layout, receipt, splitters);
	if (!isCurrent()) return;
	const blob = await workbookBlob(workbook);
	if (!isCurrent()) return;
	downloadBlob(blob, `${file.name.replace(/\.[^.]+$/, '')}-not-imported.xlsx`);
}

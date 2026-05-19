import type ExcelJS from 'exceljs';

export const WORKBOOK_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type Workbook = ExcelJS.Workbook;
export type Worksheet = ExcelJS.Worksheet;
export type WorkbookBinary = ArrayBuffer | Uint8Array;
export type WorkbookColumn = Partial<ExcelJS.Column> & {
	header: string;
	key: string;
	width?: number;
};
export type WorkbookRow = Record<string, string | number | boolean | Date | null | undefined>;

export interface TableSheetOptions {
	name: string;
	columns: WorkbookColumn[];
	rows: WorkbookRow[];
	headerFillArgb?: string;
	freezeHeader?: boolean;
}

export async function createWorkbook(): Promise<Workbook> {
	const ExcelJS = await import('exceljs');
	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'TroopToTask';
	workbook.created = new Date();
	workbook.modified = new Date();
	return workbook;
}

export function addTableSheet(workbook: Workbook, options: TableSheetOptions): Worksheet {
	const sheet = workbook.addWorksheet(options.name);
	sheet.columns = options.columns;
	sheet.addRows(options.rows);
	styleHeaderRow(sheet, options.headerFillArgb);
	if (options.freezeHeader ?? true) {
		sheet.views = [{ state: 'frozen', ySplit: 1 }];
	}
	return sheet;
}

export function styleHeaderRow(sheet: Worksheet, fillArgb = 'FFE8E8E8'): void {
	const headerRow = sheet.getRow(1);
	headerRow.font = { bold: true };
	headerRow.eachCell((cell) => {
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
	});
}

export async function writeWorkbookBuffer(workbook: Workbook): Promise<ArrayBuffer> {
	const buffer = (await workbook.xlsx.writeBuffer()) as WorkbookBinary;
	return toArrayBuffer(buffer);
}

export async function workbookBlob(workbook: Workbook): Promise<Blob> {
	const buffer = await writeWorkbookBuffer(workbook);
	return new Blob([buffer], { type: WORKBOOK_MIME_TYPE });
}

export function downloadBlob(blob: Blob, filename: string, revokeDelayMs = 0): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	setTimeout(() => URL.revokeObjectURL(url), revokeDelayMs);
}

export async function downloadWorkbook(workbook: Workbook, filename: string): Promise<void> {
	downloadBlob(await workbookBlob(workbook), filename);
}

export async function workbookResponse(
	workbookOrBuffer: Workbook | WorkbookBinary,
	filename: string
): Promise<Response> {
	const buffer = isWorkbookBinary(workbookOrBuffer)
		? toArrayBuffer(workbookOrBuffer)
		: await writeWorkbookBuffer(workbookOrBuffer);
	return new Response(buffer, {
		headers: {
			'Content-Type': WORKBOOK_MIME_TYPE,
			'Content-Disposition': contentDispositionAttachment(filename)
		}
	});
}

function isWorkbookBinary(value: Workbook | WorkbookBinary): value is WorkbookBinary {
	return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

function toArrayBuffer(buffer: WorkbookBinary): ArrayBuffer {
	if (buffer instanceof ArrayBuffer) return buffer;
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export function contentDispositionAttachment(filename: string): string {
	const escaped = filename.replace(/["\\]/g, '_');
	return `attachment; filename="${escaped}"`;
}

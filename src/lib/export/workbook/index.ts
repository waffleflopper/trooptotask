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
	const WorkbookCtor =
		(
			ExcelJS as unknown as {
				Workbook?: new () => Workbook;
				default?: { Workbook?: new () => Workbook };
			}
		).Workbook ??
		(
			ExcelJS as unknown as {
				default?: { Workbook?: new () => Workbook };
			}
		).default?.Workbook;
	if (!WorkbookCtor) {
		throw new Error('ExcelJS Workbook constructor is unavailable');
	}
	const workbook = new WorkbookCtor();
	workbook.creator = 'TroopToTask';
	workbook.created = new Date();
	workbook.modified = new Date();
	return workbook;
}

export function addTableSheet(workbook: Workbook, options: TableSheetOptions): Worksheet {
	const sheet = workbook.addWorksheet(options.name);
	sheet.columns = options.columns;
	sheet.addRows(options.rows.map(normalizeWorkbookRow));
	styleHeaderRow(sheet, options.headerFillArgb);
	if (options.freezeHeader ?? true) {
		sheet.views = [{ state: 'frozen', ySplit: 1 }];
	}
	return sheet;
}

function normalizeWorkbookRow(row: WorkbookRow): WorkbookRow {
	return Object.fromEntries(
		Object.entries(row).map(([key, value]) => [key, value === '' ? null : value])
	) as WorkbookRow;
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
	filename: string,
	headers: HeadersInit = {}
): Promise<Response> {
	const buffer = isWorkbookBinary(workbookOrBuffer)
		? toArrayBuffer(workbookOrBuffer)
		: await writeWorkbookBuffer(workbookOrBuffer);
	return workbookBufferResponse(buffer, filename, headers);
}

export function workbookBufferResponse(buffer: WorkbookBinary, filename: string, headers: HeadersInit = {}): Response {
	const arrayBuffer = toArrayBuffer(buffer);
	return new Response(new Uint8Array(arrayBuffer), {
		headers: {
			...headers,
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
	const escaped = [...filename]
		.map((char) => {
			const codePoint = char.codePointAt(0);
			return codePoint === undefined || codePoint < 32 || codePoint === 127 || char === '"' || char === '\\'
				? '_'
				: char;
		})
		.join('');
	return `attachment; filename="${escaped}"`;
}

export function filenameFromContentDisposition(disposition: string | null, fallback: string): string {
	const filenameStarMatch = disposition?.match(/filename\*=UTF-8''([^;]+)/i);
	if (filenameStarMatch?.[1]) {
		return decodeURIComponent(filenameStarMatch[1]);
	}
	const filenameMatch = disposition?.match(/filename="([^"]+)"/i) ?? disposition?.match(/filename=([^;]+)/i);
	return filenameMatch?.[1]?.trim() || fallback;
}

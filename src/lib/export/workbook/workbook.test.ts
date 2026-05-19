// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import {
	WORKBOOK_MIME_TYPE,
	addTableSheet,
	contentDispositionAttachment,
	createWorkbook,
	downloadBlob,
	workbookResponse,
	writeWorkbookBuffer
} from './index';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

function toWorkbookBuffer(buffer: ArrayBuffer): WorkbookLoadBuffer {
	return Buffer.from(buffer) as unknown as WorkbookLoadBuffer;
}

describe('workbook export helpers', () => {
	it('creates parseable table workbooks with styled header rows', async () => {
		const workbook = await createWorkbook();
		addTableSheet(workbook, {
			name: 'Roster',
			columns: [
				{ header: 'Name', key: 'name', width: 24 },
				{ header: 'Duty', key: 'duty', width: 16 }
			],
			rows: [{ name: 'Able, Avery', duty: 'Staff Duty' }]
		});

		const parsed = new ExcelJS.Workbook();
		await parsed.xlsx.load(toWorkbookBuffer(await writeWorkbookBuffer(workbook)));
		const sheet = parsed.getWorksheet('Roster');

		expect(sheet?.getCell('A1').value).toBe('Name');
		expect(sheet?.getCell('A1').font?.bold).toBe(true);
		expect(sheet?.getCell('A2').value).toBe('Able, Avery');
		expect(sheet?.getColumn(1).width).toBe(24);
	});

	it('writes empty strings as blank cells so styled sheets do not expose style ids', async () => {
		const workbook = await createWorkbook();
		addTableSheet(workbook, {
			name: 'Blank Cells',
			columns: [
				{ header: 'Name', key: 'name' },
				{ header: 'Optional', key: 'optional' }
			],
			rows: [{ name: 'Able, Avery', optional: '' }]
		});

		const parsed = new ExcelJS.Workbook();
		await parsed.xlsx.load(toWorkbookBuffer(await writeWorkbookBuffer(workbook)));

		expect(parsed.getWorksheet('Blank Cells')?.getCell('B2').value).toBeNull();
	});

	it('downloads blobs through one anchor path and revokes after the click task', () => {
		vi.useFakeTimers();
		const click = vi.fn(() => {
			expect(document.body.querySelector('a[download]')).not.toBeNull();
			expect(URL.revokeObjectURL).not.toHaveBeenCalled();
		});
		const originalCreateObjectURL = URL.createObjectURL;
		const originalRevokeObjectURL = URL.revokeObjectURL;
		const originalCreateElement = document.createElement.bind(document);
		const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
			const element = originalCreateElement(tagName);
			if (tagName === 'a') {
				element.click = click;
			}
			return element;
		});

		URL.createObjectURL = vi.fn(() => 'blob:workbook-export') as unknown as typeof URL.createObjectURL;
		URL.revokeObjectURL = vi.fn();

		try {
			downloadBlob(new Blob(['workbook'], { type: WORKBOOK_MIME_TYPE }), 'export.xlsx');

			expect(click).toHaveBeenCalledOnce();
			expect(URL.revokeObjectURL).not.toHaveBeenCalled();
			vi.runOnlyPendingTimers();
			expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:workbook-export');
		} finally {
			createElementSpy.mockRestore();
			URL.createObjectURL = originalCreateObjectURL;
			URL.revokeObjectURL = originalRevokeObjectURL;
			vi.useRealTimers();
		}
	});

	it('returns native workbook responses with escaped attachment filenames', async () => {
		const workbook = await createWorkbook();
		addTableSheet(workbook, {
			name: 'Export',
			columns: [{ header: 'Value', key: 'value' }],
			rows: [{ value: 'one' }]
		});

		const response = await workbookResponse(workbook, 'bad"name.xlsx');

		expect(response.headers.get('Content-Type')).toBe(WORKBOOK_MIME_TYPE);
		expect(response.headers.get('Content-Disposition')).toBe(contentDispositionAttachment('bad"name.xlsx'));

		const parsed = new ExcelJS.Workbook();
		await parsed.xlsx.load(toWorkbookBuffer(await response.arrayBuffer()));
		expect(parsed.getWorksheet('Export')?.getCell('A2').value).toBe('one');
	});
});

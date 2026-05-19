import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';

const { mockSave, mockText, mockJsPDF, mockAutoTable } = vi.hoisted(() => {
	const mockSave = vi.fn();
	const mockText = vi.fn();
	const mockSetFontSize = vi.fn();
	const mockSetFillColor = vi.fn();
	const mockRect = vi.fn();
	const mockSetTextColor = vi.fn();
	const mockJsPDF = vi.fn(function (this: Record<string, unknown>) {
		this.internal = { pageSize: { getWidth: () => 792 } };
		this.save = mockSave;
		this.text = mockText;
		this.setFontSize = mockSetFontSize;
		this.setFillColor = mockSetFillColor;
		this.rect = mockRect;
		this.setTextColor = mockSetTextColor;
	});
	const mockAutoTable = vi.fn();
	return { mockSave, mockText, mockJsPDF, mockAutoTable };
});

vi.mock('jspdf', () => ({
	jsPDF: mockJsPDF
}));

vi.mock('jspdf-autotable', () => ({
	default: mockAutoTable
}));

import { exportMonthToExcel, exportQuarterToExcel, printMonthCalendar, printQuarterCalendar } from './calendarExport';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, SpecialDay, StatusType } from '$lib/types';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

function makeExportOptions() {
	return {
		personnelByGroup: [
			{
				group: 'Alpha',
				personnel: [
					{
						id: '1',
						rank: 'SGT',
						lastName: 'Smith',
						firstName: 'John',
						groupName: 'Alpha',
						groupId: 'g1'
					} as Personnel
				]
			}
		],
		availabilityEntries: [],
		statusTypes: [],
		specialDays: [],
		assignmentTypes: [],
		assignments: []
	};
}

function guardedArray<T>(items: T[], methods: Array<'find' | 'filter'>, mapLimit = Number.POSITIVE_INFINITY): T[] {
	for (const method of methods) {
		Object.defineProperty(items, method, {
			value: () => {
				throw new Error(`calendar export should not call ${method} in the cell hot path`);
			}
		});
	}
	let mapCalls = 0;
	Object.defineProperty(items, 'map', {
		value: (callback: (value: T, index: number, array: T[]) => unknown) => {
			mapCalls += 1;
			if (mapCalls > mapLimit) {
				throw new Error('calendar export should build lookup maps once per export');
			}
			return Array.prototype.map.call(items, callback);
		}
	});
	return items;
}

function makeIndexedExportOptions() {
	const personnel = [
		{
			id: 'person-1',
			rank: 'SGT',
			lastName: 'Smith',
			firstName: 'John',
			groupName: 'Alpha',
			groupId: 'g1'
		} as Personnel,
		{
			id: 'person-2',
			rank: 'SPC',
			lastName: 'Jones',
			firstName: 'Jane',
			groupName: 'Alpha',
			groupId: 'g1'
		} as Personnel
	];
	const statusTypes = guardedArray<StatusType>(
		[
			{
				id: 'leave',
				name: 'Leave',
				color: '#fde68a',
				textColor: '#111827',
				da6TreatmentReviewed: true
			},
			{
				id: 'school',
				name: 'School',
				color: '#16a34a',
				textColor: '#ffffff',
				da6TreatmentReviewed: true
			}
		],
		['find'],
		1
	);
	const availabilityEntries = guardedArray<AvailabilityEntry>(
		[
			{
				id: 'leave-person-1',
				personnelId: 'person-1',
				statusTypeId: 'leave',
				startDate: '2026-03-02',
				endDate: '2026-03-04'
			},
			{
				id: 'overlap-person-1',
				personnelId: 'person-1',
				statusTypeId: 'school',
				startDate: '2026-03-03',
				endDate: '2026-03-03'
			}
		],
		['find', 'filter']
	);
	const specialDays = guardedArray<SpecialDay>(
		[{ id: 'holiday', date: '2026-03-06', name: 'Training Holiday', type: 'federal-holiday' }],
		['find']
	);
	const assignmentTypes = guardedArray<AssignmentType>(
		[
			{
				id: 'staff-duty',
				name: 'Staff Duty',
				shortName: 'SD',
				assignTo: 'personnel',
				color: '#111827',
				exemptPersonnelIds: [],
				showInDateHeader: true
			},
			{
				id: 'cq',
				name: 'CQ',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#334155',
				exemptPersonnelIds: [],
				showInDateHeader: true
			}
		],
		['find'],
		1
	);
	const assignments = guardedArray<DailyAssignment>(
		[
			{ id: 'assignment-1', date: '2026-03-03', assignmentTypeId: 'staff-duty', assigneeId: 'person-1' },
			{ id: 'assignment-2', date: '2026-03-03', assignmentTypeId: 'cq', assigneeId: 'person-1' },
			{ id: 'assignment-3', date: '2026-03-04', assignmentTypeId: 'staff-duty', assigneeId: 'person-2' }
		],
		['filter']
	);

	return {
		personnelByGroup: [{ group: 'Alpha', personnel }],
		availabilityEntries,
		statusTypes,
		specialDays,
		assignmentTypes,
		assignments
	};
}

function toWorkbookBuffer(buffer: ArrayBuffer): WorkbookLoadBuffer {
	return buffer as WorkbookLoadBuffer;
}

async function loadWorkbookFromBlob(blob: Blob): Promise<ExcelJS.Workbook> {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(toWorkbookBuffer(await blob.arrayBuffer()));
	return workbook;
}

async function captureDownload(callback: () => void | Promise<void>): Promise<{ blob: Blob; filename: string }> {
	let blob: Blob | null = null;
	let filename = '';
	const originalDocument = globalThis.document;
	const link = { href: '', download: '', click: vi.fn() };
	Object.defineProperty(globalThis, 'document', {
		value: {
			createElement: vi.fn(() => link),
			body: {
				appendChild: vi.fn((node: typeof link) => {
					filename = node.download;
					return node;
				}),
				removeChild: vi.fn()
			}
		},
		configurable: true
	});
	const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
		blob = value as Blob;
		return 'blob:calendar-export';
	});
	const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

	try {
		await callback();
		expect(blob).toBeTruthy();
		return { blob: blob!, filename };
	} finally {
		Object.defineProperty(globalThis, 'document', { value: originalDocument, configurable: true });
		createObjectURL.mockRestore();
		revokeObjectURL.mockRestore();
	}
}

describe('calendar Excel exports', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders month workbook cells from pre-indexed status, assignment, and special-day data', async () => {
		const download = await captureDownload(() => exportMonthToExcel(2026, 2, makeIndexedExportOptions()));
		const workbook = await loadWorkbookFromBlob(download.blob);
		const sheet = workbook.getWorksheet('March 2026');
		expect(sheet).toBeTruthy();

		expect(download.filename).toBe('calendar-March-2026.xlsx');
		expect(download.blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
		expect(sheet!.getCell('C4').value).toBe('Leave');
		expect(sheet!.getCell('D4').value).toBe('Leave (SD, CQ)');
		expect(sheet!.getCell('D4').fill).toMatchObject({ fgColor: { argb: 'FFFDE68A' } });
		expect(sheet!.getCell('D4').font).toMatchObject({ color: { argb: 'FF111827' } });
		expect(sheet!.getCell('B5').value).toBeNull();
		expect(sheet!.getCell('G2').fill).toMatchObject({ fgColor: { argb: 'FFFEF3C7' } });
	});

	it('renders quarter workbook cells from the same pre-indexed data path', async () => {
		const download = await captureDownload(() =>
			exportQuarterToExcel(new Date(2026, 2, 1), makeIndexedExportOptions())
		);
		const workbook = await loadWorkbookFromBlob(download.blob);
		const sheet = workbook.getWorksheet('March to May');
		expect(sheet).toBeTruthy();

		expect(download.filename).toBe('calendar-March-2026-to-May-2026.xlsx');
		expect(sheet!.getCell('B1').value).toBe('March 2026');
		expect(sheet!.getCell('C4').value).toBe('Leave');
		expect(sheet!.getCell('D4').value).toBe('Leave (SD, CQ)');
		expect(sheet!.getCell('D4').fill).toMatchObject({ fgColor: { argb: 'FFFDE68A' } });
		expect(sheet!.getCell('B5').value).toBeNull();
		expect(sheet!.getCell('G2').fill).toMatchObject({ fgColor: { argb: 'FFFEF3C7' } });
	});
});

describe('printMonthCalendar', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns a promise (is async)', async () => {
		const result = printMonthCalendar(2026, 2, makeExportOptions());
		expect(result).toBeInstanceOf(Promise);
		await result;
	});

	it('creates a jsPDF document and saves it', async () => {
		await printMonthCalendar(2026, 2, makeExportOptions());

		expect(mockJsPDF).toHaveBeenCalledWith(
			expect.objectContaining({ orientation: 'landscape', unit: 'pt', format: 'letter' })
		);
		expect(mockAutoTable).toHaveBeenCalled();
		expect(mockSave).toHaveBeenCalledWith(expect.stringContaining('.pdf'));
	});

	it('includes the month name and year in the title', async () => {
		await printMonthCalendar(2026, 2, makeExportOptions());

		expect(mockText).toHaveBeenCalledWith('March 2026', expect.any(Number), expect.any(Number), expect.any(Object));
	});

	it('builds PDF cell content and styles from pre-indexed export data', async () => {
		await printMonthCalendar(2026, 2, makeIndexedExportOptions());

		const tableOptions = mockAutoTable.mock.calls.at(-1)?.[1];
		expect(tableOptions.body).toEqual(
			expect.arrayContaining([expect.arrayContaining([expect.stringContaining('SGT Smith'), 'Leave', 'Leave\nSD, CQ'])])
		);
		const statusCell = { styles: {} };
		tableOptions.didParseCell({
			section: 'body',
			row: { index: 1 },
			column: { index: 2 },
			cell: statusCell
		});
		expect(statusCell.styles).toMatchObject({ fillColor: [253, 230, 138], textColor: [17, 24, 39] });
		const weekendCell = { styles: {} };
		tableOptions.didParseCell({
			section: 'body',
			row: { index: 2 },
			column: { index: 1 },
			cell: weekendCell
		});
		expect(weekendCell.styles).toMatchObject({ fillColor: [243, 244, 246] });
		const holidayCell = { styles: {} };
		tableOptions.didParseCell({
			section: 'body',
			row: { index: 2 },
			column: { index: 6 },
			cell: holidayCell
		});
		expect(holidayCell.styles).toMatchObject({ fillColor: [254, 243, 199] });
	});
});

describe('printQuarterCalendar', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns a promise (is async)', async () => {
		const result = printQuarterCalendar(new Date(2026, 0, 1), makeExportOptions());
		expect(result).toBeInstanceOf(Promise);
		await result;
	});

	it('creates a jsPDF document and saves it', async () => {
		await printQuarterCalendar(new Date(2026, 0, 1), makeExportOptions());

		expect(mockJsPDF).toHaveBeenCalledWith(
			expect.objectContaining({ orientation: 'landscape', unit: 'pt', format: 'letter' })
		);
		expect(mockAutoTable).toHaveBeenCalled();
		expect(mockSave).toHaveBeenCalledWith(expect.stringContaining('.pdf'));
	});

	it('includes quarter range in the title', async () => {
		await printQuarterCalendar(new Date(2026, 0, 1), makeExportOptions());

		// Should contain the start and end month names
		expect(mockText).toHaveBeenCalledWith(
			expect.stringContaining('January'),
			expect.any(Number),
			expect.any(Number),
			expect.any(Object)
		);
	});

	it('keeps compact quarter PDF cells indexed and visually styled', async () => {
		await printQuarterCalendar(new Date(2026, 2, 1), makeIndexedExportOptions());

		const tableOptions = mockAutoTable.mock.calls.at(-1)?.[1];
		expect(tableOptions.body).toEqual(
			expect.arrayContaining([expect.arrayContaining([expect.stringContaining('SGT Smith')])])
		);
		expect(tableOptions.body.flat()).not.toContain('SD');
		expect(tableOptions.body.flat()).not.toContain('Leave');
		const statusCell = { styles: {} };
		tableOptions.didParseCell({
			section: 'body',
			row: { index: 1 },
			column: { index: 2 },
			cell: statusCell
		});
		expect(statusCell.styles).toMatchObject({ fillColor: [253, 230, 138], textColor: [17, 24, 39] });
		const weekendCell = { styles: {} };
		tableOptions.didParseCell({
			section: 'body',
			row: { index: 2 },
			column: { index: 1 },
			cell: weekendCell
		});
		expect(weekendCell.styles).toMatchObject({ fillColor: [243, 244, 246] });
		const holidayCell = { styles: {} };
		tableOptions.didParseCell({
			section: 'body',
			row: { index: 2 },
			column: { index: 6 },
			cell: holidayCell
		});
		expect(holidayCell.styles).toMatchObject({ fillColor: [254, 243, 199] });
	});
});

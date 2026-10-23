import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';

import { exportMonthToExcel, exportQuarterToExcel } from './calendarExport';
import type { Personnel } from '$features/personnel/contracts';
import type {
	AssignmentType,
	AvailabilityEntry,
	SpecialDay,
	StatusType,
	DailyAssignment
} from '$features/calendar/contracts';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

function makeOverlappingExportOptions() {
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
	const statusTypes: StatusType[] = [
		{
			id: 'leave',
			name: 'Leave',
			color: '#fde68a',
			textColor: '#111827',
			shortLabel: null,
			rosterEffect: 'A',
			sortOrder: 0
		},
		{
			id: 'school',
			name: 'School',
			color: '#16a34a',
			textColor: '#ffffff',
			shortLabel: null,
			rosterEffect: 'A',
			sortOrder: 1
		}
	];
	const availabilityEntries: AvailabilityEntry[] = [
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
	];
	const specialDays: SpecialDay[] = [
		{ id: 'holiday', date: '2026-03-06', name: 'Training Holiday', type: 'federal-holiday' }
	];
	const assignmentTypes: AssignmentType[] = [
		{
			id: 'staff-duty',
			name: 'Staff Duty',
			shortName: 'SD',
			assignTo: 'personnel',
			color: '#111827',
			poolRules: null,
			weekendMode: 'same',
			excusals: [],
			showOnCalendar: true,
			sortOrder: 0
		},
		{
			id: 'cq',
			name: 'CQ',
			shortName: 'CQ',
			assignTo: 'personnel',
			color: '#334155',
			poolRules: null,
			weekendMode: 'same',
			excusals: [],
			showOnCalendar: true,
			sortOrder: 0
		}
	];
	const assignments: DailyAssignment[] = [
		{ id: 'assignment-1', date: '2026-03-03', assignmentTypeId: 'staff-duty', assigneeId: 'person-1' },
		{ id: 'assignment-2', date: '2026-03-03', assignmentTypeId: 'cq', assigneeId: 'person-1' },
		{ id: 'assignment-3', date: '2026-03-04', assignmentTypeId: 'staff-duty', assigneeId: 'person-2' }
	];

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

	it('renders month workbook cells for overlapping availability, assignments, and holidays', async () => {
		const download = await captureDownload(() => exportMonthToExcel(2026, 2, makeOverlappingExportOptions()));
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

	it('renders quarter workbook cells for overlapping availability, assignments, and holidays', async () => {
		const download = await captureDownload(() =>
			exportQuarterToExcel(new Date(2026, 2, 1), makeOverlappingExportOptions())
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

import { NESTED_GROUPS } from '$lib/test-support/nestedGroups';
import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import type { Personnel } from '$features/personnel/contracts';
import type { AssignmentType, StatusType } from '$features/calendar/contracts';
import { computeAvailabilityBoard } from '../../utils/availabilityBoard';
import {
	exportAssignmentCoverageWorkbook,
	exportAvailabilityWorkbook,
	exportPersonnelTempoWorkbook,
	exportStatusDaysWorkbook
} from './calendarReportWorkbookExport';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

const smith = {
	id: 'p1',
	rank: 'SGT',
	lastName: 'Smith',
	firstName: 'John',
	groupId: 'g1',
	groupName: 'Alpha'
} as Personnel;

const leaveStatus = {
	id: 'leave',
	name: 'Leave',
	color: '#facc15',
	textColor: '#111827'
} as StatusType;

const staffDuty = {
	id: 'staff-duty',
	name: 'Staff Duty',
	shortName: 'SD',
	color: '#111827',
	assignTo: 'personnel',
	poolRules: null,
	weekendMode: 'same',
	excusals: [],
	showOnCalendar: true,
	sortOrder: 0
} as AssignmentType;

async function captureWorkbook(
	callback: () => Promise<void>
): Promise<{ workbook: ExcelJS.Workbook; filename: string }> {
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
		return 'blob:calendar-report-export';
	});
	const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

	try {
		await callback();
		expect(blob).toBeTruthy();
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load((await blob!.arrayBuffer()) as WorkbookLoadBuffer);
		return { workbook, filename };
	} finally {
		Object.defineProperty(globalThis, 'document', { value: originalDocument, configurable: true });
		createObjectURL.mockRestore();
		revokeObjectURL.mockRestore();
	}
}

describe('calendar report workbook exports', () => {
	it('exports the Availability lens as daily and group-by-day sheets', async () => {
		const jones = { ...smith, id: 'p2', lastName: 'Jones', groupId: 'alpha' } as Personnel;
		const board = computeAvailabilityBoard({
			personnel: [{ ...smith, groupId: 'alpha' } as Personnel, jones],
			entries: [{ id: 'e1', personnelId: 'p1', statusTypeId: 'leave', startDate: '2026-03-02', endDate: '2026-03-02' }],
			statusTypes: [leaveStatus],
			awayStatusTypeIds: new Set(['leave']),
			groups: NESTED_GROUPS,
			selectedRootIds: new Set(['platoon']),
			includeUnassigned: false,
			startDate: '2026-03-02',
			endDate: '2026-03-03'
		});
		const { workbook, filename } = await captureWorkbook(() =>
			exportAvailabilityWorkbook(board, [leaveStatus], NESTED_GROUPS, '2026-03-02', '2026-03-03')
		);

		expect(filename).toBe('availability_2026-03-02_2026-03-03.xlsx');
		const daily = workbook.getWorksheet('Availability by day');
		expect(daily?.getRow(1).values).toEqual([
			undefined,
			'Date',
			'Here',
			'Away',
			'Total',
			'Here percent',
			'Leave',
			'Away personnel'
		]);
		expect(daily?.getRow(2).values).toEqual([undefined, '2026-03-02', 1, 1, 2, '50%', 1, 'SGT Smith']);
		expect(daily?.getRow(3).values).toEqual([undefined, '2026-03-03', 2, 0, 2, '100%', 0]);

		const byGroup = workbook.getWorksheet('Group by day');
		expect(byGroup?.getRow(1).values).toEqual([undefined, 'Group', 'Mon 3/2', 'Tue 3/3']);
		const rows = Object.fromEntries(
			Array.from({ length: byGroup!.rowCount - 1 }, (_, index) => {
				const row = byGroup!.getRow(index + 2);
				return [row.getCell(1).value, [row.getCell(2).value, row.getCell(3).value]];
			})
		);
		expect(rows['1st Platoon / 2nd Squad / Alpha Team']).toEqual(['1/2 (50%)', '2/2 (100%)']);
		expect(rows['Total']).toEqual(['1/2 (50%)', '2/2 (100%)']);
	});

	it('exports Personnel Tempo as a native workbook', async () => {
		const { workbook, filename } = await captureWorkbook(() =>
			exportPersonnelTempoWorkbook(
				{
					activeStatusTypeIds: ['leave'],
					totalDaysInPeriod: 31,
					rows: [
						{ person: smith, totalAwayDays: 3, awayByStatus: new Map([['leave', 3]]), percentAway: 10, flagged: false }
					]
				},
				[leaveStatus],
				'2026-03-01',
				'2026-03-31'
			)
		);

		const sheet = workbook.getWorksheet('Personnel Tempo');
		expect(filename).toBe('personnel-tempo_2026-03-01_2026-03-31.xlsx');
		expect(sheet?.getCell('D1').value).toBe('Leave');
		expect(sheet?.getCell('D2').value).toBe(3);
		expect(sheet?.getCell('F2').value).toBe(10);
	});

	it('exports Assignment Coverage as a native workbook with the average row', async () => {
		const { workbook, filename } = await captureWorkbook(() =>
			exportAssignmentCoverageWorkbook(
				{
					activeAssignmentTypeIds: ['staff-duty'],
					averageTotal: 2,
					rows: [{ person: smith, assignmentCounts: new Map([['staff-duty', 2]]), totalAssignments: 2 }]
				},
				[staffDuty],
				'2026-01-01',
				'2026-12-31'
			)
		);

		const sheet = workbook.getWorksheet('Assignment Coverage');
		expect(filename).toBe('assignment-coverage_2026-01-01_2026-12-31.xlsx');
		expect(sheet?.getCell('D1').value).toBe('Staff Duty');
		expect(sheet?.getCell('F2').value).toBe('0');
		expect(sheet?.getCell('C3').value).toBe('Average');
		expect(sheet?.getCell('E3').value).toBe(2);
	});

	it('exports Status Days as a native workbook', async () => {
		const { workbook, filename } = await captureWorkbook(() =>
			exportStatusDaysWorkbook(
				{
					activeStatusTypeIds: ['leave'],
					rows: [{ person: smith, statusDays: new Map([['leave', 4]]), totalDays: 4 }]
				},
				[leaveStatus],
				'2026-01-01',
				'2026-12-31'
			)
		);

		const sheet = workbook.getWorksheet('Status Days');
		expect(filename).toBe('status-days-2026-01-01-to-2026-12-31.xlsx');
		expect(sheet?.getCell('D1').value).toBe('Leave');
		expect(sheet?.getCell('D2').value).toBe(4);
		expect(sheet?.getCell('E1').value).toBe('Total status days');
		expect(sheet?.getCell('E2').value).toBe(4);
	});
});

import { NESTED_GROUPS } from '$lib/test-support/nestedGroups';
import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import type { Personnel } from '$features/personnel/contracts';
import type { AssignmentType, StatusType } from '$features/calendar/contracts';
import { computeAssignmentLoad } from '../../utils/assignmentLoad';
import { computeAvailabilityBoard } from '../../utils/availabilityBoard';
import { computeTimeAway } from '../../utils/timeAway';
import {
	exportAssignmentLoadWorkbook,
	exportAvailabilityWorkbook,
	exportTimeAwayWorkbook
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

	it('exports Time away as a per-person sheet and a per-group sheet', async () => {
		const tdyStatus = { ...leaveStatus, id: 'tdy', name: 'TDY' } as StatusType;
		const jones = { ...smith, id: 'p2', lastName: 'Jones', groupId: 'alpha' } as Personnel;
		const report = computeTimeAway({
			personnel: [{ ...smith, groupId: 'alpha' } as Personnel, jones],
			entries: [
				{ id: 'e1', personnelId: 'p1', statusTypeId: 'leave', startDate: '2026-03-01', endDate: '2026-03-03' },
				{ id: 'e2', personnelId: 'p1', statusTypeId: 'tdy', startDate: '2026-03-04', endDate: '2026-03-20' }
			],
			statusTypes: [leaveStatus, tdyStatus],
			awayStatusTypeIds: new Set(['leave', 'tdy']),
			groups: NESTED_GROUPS,
			showSubGroups: false,
			startDate: '2026-03-01',
			endDate: '2026-03-10'
		});
		const { workbook, filename } = await captureWorkbook(() =>
			exportTimeAwayWorkbook(report, [leaveStatus, tdyStatus], 5, '2026-03-01', '2026-03-10')
		);

		expect(filename).toBe('time-away_2026-03-01_2026-03-10.xlsx');
		const people = workbook.getWorksheet('Time away by person');
		expect(people?.getRow(1).values).toEqual([
			undefined,
			'Rank',
			'Last Name',
			'First Name',
			'Group',
			'Leave',
			'TDY',
			'Total days away',
			'Percent of span',
			'Flagged (5+ days)',
			'Next out',
			'Next out day'
		]);
		expect(people?.getRow(2).values).toEqual([
			undefined,
			'SGT',
			'Smith',
			'John',
			'Alpha',
			3,
			7,
			10,
			100,
			'Yes',
			'TDY (continues)',
			'2026-03-11'
		]);
		expect(people?.getRow(3).values).toEqual([undefined, 'SGT', 'Jones', 'John', 'Alpha', 0, 0, 0, 0]);

		const groups = workbook.getWorksheet('Time away by group');
		expect(groups?.getRow(2).values).toEqual([undefined, '1st Platoon', 2, 10, 5]);
	});

	it('exports Assignment load with fair share, the average row and a sheet per duty', async () => {
		const jones = { ...smith, id: 'p2', lastName: 'Jones' } as Personnel;
		const report = computeAssignmentLoad({
			roster: [smith, jones],
			shown: [smith, jones],
			assignments: [
				{ id: 'd1', date: '2026-03-01', assignmentTypeId: 'staff-duty', assigneeId: 'p1' },
				{ id: 'd2', date: '2026-03-02', assignmentTypeId: 'staff-duty', assigneeId: 'p1' }
			],
			assignmentTypes: [staffDuty],
			excusals: [],
			typeIds: new Set(['staff-duty']),
			entries: [],
			awayStatusTypeIds: new Set(),
			rankCatalog: [],
			groups: [],
			startDate: '2026-03-01',
			endDate: '2026-03-02'
		});

		const { workbook, filename } = await captureWorkbook(() =>
			exportAssignmentLoadWorkbook(report, '2026-03-01', '2026-03-02')
		);

		expect(filename).toBe('assignment-load_2026-03-01_2026-03-02.xlsx');
		const people = workbook.getWorksheet('Assignment load by person');
		expect(people?.getRow(1).values).toEqual([
			undefined,
			'Rank',
			'Last Name',
			'First Name',
			'Group',
			'Staff Duty',
			'Total',
			'Fair share',
			'Difference from fair share',
			'Difference from average',
			'Days present',
			'Last duty'
		]);
		expect(people?.getRow(2).values).toEqual([
			undefined,
			'SGT',
			'Smith',
			'John',
			'Alpha',
			2,
			2,
			1,
			1,
			1,
			2,
			'2026-03-02'
		]);
		expect((people?.getRow(3).values as unknown[]).slice(1, 11)).toEqual([
			'SGT',
			'Jones',
			'John',
			'Alpha',
			0,
			0,
			1,
			-1,
			-1,
			2
		]);
		expect((people?.getRow(4).values as unknown[]).slice(1, 8)).toEqual([
			undefined,
			undefined,
			'Average',
			undefined,
			1,
			1,
			1
		]);

		const duties = workbook.getWorksheet('Assignment load by duty');
		expect(duties?.getRow(2).values).toEqual([undefined, 'Staff Duty', 2, 2, 1, 0, 2, 0]);
	});

	it('lists everyone reported on, including someone away the whole span, as the legacy export did', async () => {
		const brown = { ...smith, id: 'p3', lastName: 'Brown' } as Personnel;
		const report = computeAssignmentLoad({
			roster: [smith, brown],
			shown: [smith, brown],
			assignments: [{ id: 'd1', date: '2026-03-01', assignmentTypeId: 'staff-duty', assigneeId: 'p1' }],
			assignmentTypes: [staffDuty],
			excusals: [],
			typeIds: new Set(['staff-duty']),
			entries: [{ id: 'e1', personnelId: 'p3', statusTypeId: 'leave', startDate: '2026-03-01', endDate: '2026-03-02' }],
			awayStatusTypeIds: new Set(['leave']),
			rankCatalog: [],
			groups: [],
			startDate: '2026-03-01',
			endDate: '2026-03-02'
		});

		const { workbook } = await captureWorkbook(() => exportAssignmentLoadWorkbook(report, '2026-03-01', '2026-03-02'));

		const people = workbook.getWorksheet('Assignment load by person');
		expect((people?.getRow(2).values as unknown[]).slice(1, 11)).toEqual([
			'SGT',
			'Brown',
			'John',
			'Alpha',
			0,
			0,
			0,
			0,
			-0.5,
			0
		]);
		expect((people?.getRow(3).values as unknown[]).slice(2, 4)).toEqual(['Smith', 'John']);
		expect((people?.getRow(4).values as unknown[]).slice(3, 8)).toEqual(['Average', undefined, 0.5, 0.5, 0.5]);
	});
});

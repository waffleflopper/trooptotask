import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import type { AssignmentType, Personnel, StatusType } from '$lib/types';
import {
	exportAssignmentCoverageWorkbook,
	exportAvailabilityForecastWorkbook,
	exportGroupReadinessWorkbook,
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
	textColor: '#111827',
	da6TreatmentReviewed: true
} as StatusType;

const staffDuty = {
	id: 'staff-duty',
	name: 'Staff Duty',
	shortName: 'SD',
	color: '#111827',
	assignTo: 'personnel',
	exemptPersonnelIds: [],
	showInDateHeader: true
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
	it('exports Availability Forecast as a native workbook', async () => {
		const { workbook, filename } = await captureWorkbook(() =>
			exportAvailabilityForecastWorkbook(
				{
					days: [
						{
							date: '2026-03-02',
							totalPersonnel: 1,
							unavailableCount: 1,
							availableCount: 0,
							availablePercent: 0,
							unavailablePersonnel: [{ person: smith, statusName: 'Leave', statusColor: '#facc15' }]
						}
					]
				},
				'2026-03-01',
				'2026-03-31'
			)
		);

		const sheet = workbook.getWorksheet('Availability Forecast');
		expect(filename).toBe('availability-forecast_2026-03-01_2026-03-31.xlsx');
		expect(sheet?.getRow(1).values).toEqual([
			undefined,
			'Date',
			'Unavailable',
			'Available',
			'Available %',
			'Unavailable Personnel'
		]);
		expect(sheet?.getCell('D2').value).toBe('0%');
		expect(sheet?.getCell('E2').value).toBe('SGT Smith');
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

	it('exports Group Readiness as a native workbook', async () => {
		const { workbook, filename } = await captureWorkbook(() =>
			exportGroupReadinessWorkbook(
				{
					dates: ['2026-03-02'],
					groups: [
						{
							groupId: 'g1',
							groupName: 'Alpha',
							cells: [{ date: '2026-03-02', totalPersonnel: 10, availableCount: 8, availablePercent: 80 }]
						}
					]
				},
				'2026-03-02',
				'2026-03-08'
			)
		);

		const sheet = workbook.getWorksheet('Group Readiness');
		expect(filename).toBe('group-readiness_2026-03-02_2026-03-08.xlsx');
		expect(sheet?.getCell('B1').value).toBe('Mon 3/2');
		expect(sheet?.getCell('B2').value).toBe('8/10 (80%)');
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
		expect(sheet?.getCell('E2').value).toBe(4);
	});
});

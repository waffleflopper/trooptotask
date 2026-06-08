import { describe, expect, it } from 'vitest';
import { buildDa6MatrixDisplay } from './da6MatrixPresenter';
import type { Da6Cell, Da6Matrix } from '$features/duty-roster/run/dutyRosterRun.types';

describe('buildDa6MatrixDisplay', () => {
	it('builds render-ready matrix data with shared labels, glyphs, and body-derived assigned counts', () => {
		const display = buildDa6MatrixDisplay(da6Matrix(), 'draft');

		expect(display.columns).toEqual([
			{ id: '2026-06-01', weekday: 'MON', date: '01-JUN', sequenceKind: 'weekday' },
			{ id: '2026-06-06', weekday: 'SAT', date: '06-JUN', sequenceKind: 'weekend-holiday' }
		]);
		expect(display.rows).toEqual([
			{ id: 'person-1', label: 'SGT Able' },
			{ id: 'person-2', label: 'CPL Baker' }
		]);
		expect(display.cells['person-1']?.['2026-06-01']).toMatchObject({
			display: 'X',
			kind: 'assigned',
			ariaLabel: 'SGT Able MON JUN 01, 2026: X'
		});
		expect(display.cells['person-2']?.['2026-06-01']).toMatchObject({
			display: '2',
			kind: 'not-assigned'
		});
		expect(display.footerRows).toEqual([
			{
				label: 'Assigned Count',
				values: { '2026-06-01': 1, '2026-06-06': 0 }
			},
			{
				label: 'Required Count',
				values: { '2026-06-01': 2, '2026-06-06': 1 }
			}
		]);
	});

	it('keeps visible column headers consistent across draft and official modes', () => {
		expect(buildDa6MatrixDisplay(da6Matrix(), 'draft').columns).toEqual(
			buildDa6MatrixDisplay(da6Matrix(), 'official').columns
		);
		expect(buildDa6MatrixDisplay(da6Matrix(), 'official').cells['person-1']?.['2026-06-01']).toMatchObject({
			ariaLabel: 'SGT Able MON, JUN 01: X'
		});
	});
});

function da6Matrix(): Da6Matrix {
	return {
		numberingMode: 'separate-weekend-holiday',
		columns: [
			{
				date: '2026-06-01',
				sequenceKind: 'weekday',
				sequenceKey: 'weekday',
				specialDayIds: [],
				chargeSequenceStart: 1,
				chargeableCount: 2
			},
			{
				date: '2026-06-06',
				sequenceKind: 'weekend-holiday',
				sequenceKey: 'weekend-holiday',
				specialDayIds: ['holiday-1'],
				chargeSequenceStart: 1,
				chargeableCount: 1
			}
		],
		rows: [
			{
				personnelId: 'person-1',
				display: {
					id: 'person-1',
					rank: 'SGT',
					lastName: 'Able',
					firstName: 'Ann',
					groupId: 'alpha',
					groupName: 'Alpha'
				},
				cells: [
					da6Cell({ personnelId: 'person-1', assigned: true, sequenceNumber: 1 }),
					da6Cell({
						date: '2026-06-06',
						personnelId: 'person-1',
						da6Code: 'A',
						chargeable: false,
						queuePosition: null,
						sequenceNumber: null,
						reason: 'Authorized absence: Leave'
					})
				]
			},
			{
				personnelId: 'person-2',
				display: {
					id: 'person-2',
					rank: 'CPL',
					lastName: 'Baker',
					firstName: 'Ben',
					groupId: 'bravo',
					groupName: 'Bravo'
				},
				cells: [
					da6Cell({ personnelId: 'person-2', sequenceNumber: 2, queuePosition: 2 }),
					da6Cell({
						date: '2026-06-06',
						personnelId: 'person-2',
						da6Code: 'D',
						sequenceNumber: 1,
						reason: 'Other duty: Staff Duty'
					})
				]
			}
		]
	};
}

function da6Cell(overrides: Partial<Da6Cell> = {}): Da6Cell {
	return {
		date: '2026-06-01',
		personnelId: 'person-1',
		code: 'available-not-selected',
		da6Code: null,
		chargeable: true,
		queuePosition: 1,
		sequenceNumber: 1,
		assigned: false,
		reason: null,
		reasonCode: null,
		...overrides
	};
}

import { describe, expect, it } from 'vitest';
import { toDa6MatrixCell } from './da6MatrixCell';
import type { Da6Cell } from '$features/duty-roster/run/dutyRosterRun.types';

describe('toDa6MatrixCell', () => {
	it('renders assigned cells with the DA6 X glyph and assigned kind', () => {
		expect(
			toDa6MatrixCell(
				da6Cell({
					assigned: true,
					sequenceNumber: 4
				}),
				'SGT Able',
				'draft'
			)
		).toEqual({
			display: 'X',
			kind: 'assigned',
			ariaLabel: 'SGT Able MON JUN 01, 2026: X',
			chargeable: true,
			count: 4,
			reason: null
		});
	});

	it('renders DA6 availability codes with the same presentation kinds used by the matrix', () => {
		expect(
			toDa6MatrixCell(
				da6Cell({
					da6Code: 'A',
					chargeable: false,
					sequenceNumber: null,
					reason: 'Authorized absence: Leave'
				}),
				'SGT Able',
				'draft'
			)
		).toMatchObject({
			display: 'A',
			kind: 'manual-override',
			chargeable: false,
			count: null,
			reason: 'Authorized absence: Leave'
		});

		expect(
			toDa6MatrixCell(
				da6Cell({
					da6Code: 'D',
					reason: 'Other duty: Staff Duty'
				}),
				'SPC Cross',
				'official'
			)
		).toMatchObject({
			display: 'D',
			kind: 'blocked',
			ariaLabel: 'SPC Cross MON, JUN 01: D',
			reason: 'Other duty: Staff Duty'
		});
	});

	it('renders unassigned chargeable cells with the DA6 sequence number', () => {
		expect(
			toDa6MatrixCell(
				da6Cell({
					sequenceNumber: 7
				}),
				'CPL Baker',
				'draft'
			)
		).toMatchObject({
			display: '7',
			kind: 'not-assigned',
			ariaLabel: 'CPL Baker MON JUN 01, 2026: 7',
			count: 7
		});
	});
});

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

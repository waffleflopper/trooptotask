import type { Da6Cell } from '$features/duty-roster/run/dutyRosterRun.types';
import type { DA6MatrixCell, DA6MatrixCellKind, DA6MatrixMode } from './types.js';

export function toDa6MatrixCell(cell: Da6Cell, soldierLabel: string, mode: DA6MatrixMode): DA6MatrixCell {
	const display = da6CellDisplay(cell);

	return {
		display,
		kind: da6CellKind(cell, display),
		ariaLabel: `${soldierLabel} ${formatDa6MatrixDate(cell.date, mode)}: ${display}`,
		chargeable: cell.chargeable,
		count: cell.sequenceNumber,
		reason: cell.reason
	};
}

function da6CellKind(cell: Da6Cell, display: string): DA6MatrixCellKind {
	if (cell.assigned) return 'assigned';
	if (cell.da6Code === 'A') return 'manual-override';
	if (cell.da6Code === 'D' || cell.da6Code === 'U') return 'blocked';
	if (display === 'A' || display === 'EX') return 'exempt';
	return 'not-assigned';
}

function da6CellDisplay(cell: Da6Cell): string {
	if (cell.assigned) return 'X';
	if (cell.da6Code === 'A') return 'A';
	if (cell.da6Code === 'D' || cell.da6Code === 'U') return cell.da6Code;
	return cell.sequenceNumber === null ? '' : String(cell.sequenceNumber);
}

function formatDa6MatrixDate(date: string, mode: DA6MatrixMode): string {
	return mode === 'draft' ? formatDraftDutyDate(date) : formatOfficialDutyDate(date);
}

function formatDraftDutyDate(date: string): string {
	const [year, month, day] = date.split('-').map(Number);
	const value = new Date(Date.UTC(year, month - 1, day));
	const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(value).toUpperCase();
	const label = new Intl.DateTimeFormat('en-US', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	})
		.format(value)
		.toUpperCase();

	return `${weekday} ${label}`;
}

function formatOfficialDutyDate(date: string): string {
	const [year, month, day] = date.split('-').map(Number);
	if (!year || !month || !day) return date;
	return new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		day: '2-digit',
		month: 'short',
		timeZone: 'UTC'
	})
		.format(new Date(Date.UTC(year, month - 1, day)))
		.toUpperCase();
}

import type { Da6Matrix } from '$features/duty-roster/run/dutyRosterRun.types';
import { toDa6MatrixCell } from './da6MatrixCell.js';
import type { DA6MatrixCell, DA6MatrixColumn, DA6MatrixFooterRow, DA6MatrixMode, DA6MatrixRow } from './types.js';

export interface Da6MatrixDisplay {
	columns: DA6MatrixColumn[];
	rows: DA6MatrixRow[];
	cells: Record<string, Record<string, DA6MatrixCell>>;
	footerRows: DA6MatrixFooterRow[];
}

export function buildDa6MatrixDisplay(matrix: Da6Matrix, mode: DA6MatrixMode): Da6MatrixDisplay {
	const columns = matrix.columns.map((column) => ({
		id: column.date,
		...formatDa6MatrixColumnDate(column.date),
		sequenceKind: column.sequenceKind === 'weekday' ? ('weekday' as const) : ('weekend-holiday' as const)
	}));
	const rows = matrix.rows.map((row) => ({
		id: row.personnelId,
		label: soldierLabel(row.display)
	}));
	const cells = Object.fromEntries(
		matrix.rows.map((row) => {
			const label = soldierLabel(row.display);
			return [
				row.personnelId,
				Object.fromEntries(row.cells.map((cell) => [cell.date, toDa6MatrixCell(cell, label, mode)]))
			];
		})
	);

	return {
		columns,
		rows,
		cells,
		footerRows: [
			{
				label: 'Assigned Count',
				values: Object.fromEntries(
					columns.map((column) => [
						column.id,
						rows.reduce((total, row) => total + (cells[row.id]?.[column.id]?.kind === 'assigned' ? 1 : 0), 0)
					])
				)
			},
			{
				label: 'Required Count',
				values: Object.fromEntries(matrix.columns.map((column) => [column.date, column.chargeableCount]))
			}
		]
	};
}

function soldierLabel(display: { rank: string; lastName: string }): string {
	return `${display.rank} ${display.lastName}`;
}

function formatDa6MatrixColumnDate(date: string): Pick<DA6MatrixColumn, 'weekday' | 'date'> {
	const [year, month, day] = date.split('-').map(Number);
	if (!year || !month || !day) {
		return { weekday: '', date };
	}
	const value = new Date(Date.UTC(year, month - 1, day));
	const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(value).toUpperCase();
	const parts = new Intl.DateTimeFormat('en-US', {
		day: '2-digit',
		month: 'short',
		timeZone: 'UTC'
	}).formatToParts(value);
	const dayPart = parts.find((part) => part.type === 'day')?.value ?? date.slice(-2);
	const monthPart = parts.find((part) => part.type === 'month')?.value.toUpperCase() ?? '';

	return { weekday, date: `${dayPart}-${monthPart}` };
}

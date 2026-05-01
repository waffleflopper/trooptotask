import type { AdvancedDutyDa6Matrix } from '../duty-roster.types';

type AdvancedDutyDa6Column = AdvancedDutyDa6Matrix['columns'][number];
type AdvancedDutyDa6Cell = AdvancedDutyDa6Matrix['rows'][number]['cells'][number];

export function formatAdvancedDutyDa6DisplayDate(value: string): string {
	return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

export function formatAdvancedDutyDa6CoverageLabel(column: AdvancedDutyDa6Column): string {
	const start = column.coverageStart.slice(11, 16).replace(':', '');
	const end = column.coverageEnd.slice(11, 16).replace(':', '');
	return column.coverageStart.slice(0, 10) === column.coverageEnd.slice(0, 10)
		? `${start}-${end}`
		: `${start}-${end} next day`;
}

export function formatAdvancedDutyDa6CellLabel(cell: AdvancedDutyDa6Cell): string {
	if (cell.assigned) return 'X';
	if (cell.da6Code === 'A') return 'A';
	if (cell.da6Code === 'D' || cell.da6Code === 'U') {
		return `${cell.da6Code}${cell.sequenceNumber ?? ''}`;
	}
	return cell.sequenceNumber == null ? '' : String(cell.sequenceNumber);
}

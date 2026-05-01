import type { AdvancedDutyDa6Matrix } from '../duty-roster.types';

function formatDisplayDate(value: string): string {
	return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

function formatCoverageLabel(column: AdvancedDutyDa6Matrix['columns'][number]): string {
	const start = column.coverageStart.slice(11, 16).replace(':', '');
	const end = column.coverageEnd.slice(11, 16).replace(':', '');
	return column.coverageStart.slice(0, 10) === column.coverageEnd.slice(0, 10)
		? `${start}-${end}`
		: `${start}-${end} next day`;
}

function formatCellLabel(cell: AdvancedDutyDa6Matrix['rows'][number]['cells'][number]): string {
	if (cell.assigned) return 'X';
	if (cell.da6Code === 'A') return 'A';
	if (cell.da6Code === 'D' || cell.da6Code === 'U') {
		return `${cell.da6Code}${cell.sequenceNumber ?? ''}`;
	}
	return cell.sequenceNumber == null ? '' : String(cell.sequenceNumber);
}

export function printAdvancedDutyDa6Matrices(title: string, matrices: AdvancedDutyDa6Matrix[]): void {
	const printWindow = window.open('', '_blank', 'noopener,noreferrer');
	if (!printWindow) return;

	const markup = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
body { font-family: Arial, sans-serif; margin: 24px; color: #1f1f1d; }
h1, h2, p { margin: 0; }
.header { display: grid; gap: 8px; margin-bottom: 16px; }
.legend { color: #555; margin-bottom: 16px; }
.matrix { margin-bottom: 24px; break-inside: avoid; }
.meta { color: #555; margin-top: 4px; margin-bottom: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { border: 1px solid #cfcfca; padding: 6px 8px; text-align: center; }
th:first-child, td:first-child { text-align: left; min-width: 220px; }
</style>
</head>
<body>
<div class="header">
<h1>${title}</h1>
<p class="legend">Legend: X assigned, A authorized absence, D# other duty or blocked, U# misconduct unavailable.</p>
</div>
${matrices
	.map(
		(matrix) => `<section class="matrix">
<h2>${matrix.roleLabel}</h2>
<p class="meta">${matrix.sequenceLabel} | Pool ${matrix.rotationPoolKey}</p>
<table>
<thead>
<tr>
<th>Name</th>
${matrix.columns
	.map((column) => `<th>${formatDisplayDate(column.eventDate)}<br /><span>${formatCoverageLabel(column)}</span></th>`)
	.join('')}
</tr>
</thead>
<tbody>
${matrix.rows
	.map(
		(row) => `<tr>
<td>${row.display.rank} ${row.display.lastName}, ${row.display.firstName}</td>
${row.cells.map((cell) => `<td>${formatCellLabel(cell)}</td>`).join('')}
</tr>`
	)
	.join('')}
</tbody>
</table>
</section>`
	)
	.join('')}
</body>
</html>`;

	printWindow.document.open();
	printWindow.document.write(markup);
	printWindow.document.close();
	printWindow.focus();
	printWindow.print();
}

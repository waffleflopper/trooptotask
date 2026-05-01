import type { AdvancedDutyDa6Matrix } from '../duty-roster.types';
import {
	formatAdvancedDutyDa6CellLabel,
	formatAdvancedDutyDa6CoverageLabel,
	formatAdvancedDutyDa6DisplayDate
} from './advancedDutyDa6Format';

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function printAdvancedDutyDa6Matrices(title: string, matrices: AdvancedDutyDa6Matrix[]): void {
	const printWindow = window.open('', '_blank', 'noopener,noreferrer');
	if (!printWindow) return;
	const safeTitle = escapeHtml(title);

	const markup = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
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
<h1>${safeTitle}</h1>
<p class="legend">Legend: X assigned, A authorized absence, D# other duty or blocked, U# misconduct unavailable.</p>
</div>
${matrices
	.map(
		(matrix) => `<section class="matrix">
<h2>${escapeHtml(matrix.roleLabel)}</h2>
<p class="meta">${escapeHtml(matrix.sequenceLabel)} | Pool ${escapeHtml(matrix.rotationPoolKey)}</p>
<table>
<thead>
<tr>
<th>Name</th>
${matrix.columns
	.map(
		(column) =>
			`<th>${escapeHtml(formatAdvancedDutyDa6DisplayDate(column.eventDate))}<br /><span>${escapeHtml(formatAdvancedDutyDa6CoverageLabel(column))}</span></th>`
	)
	.join('')}
</tr>
</thead>
<tbody>
${matrix.rows
	.map(
		(row) => `<tr>
<td>${escapeHtml(row.display.rank)} ${escapeHtml(row.display.lastName)}, ${escapeHtml(row.display.firstName)}</td>
${row.cells.map((cell) => `<td>${escapeHtml(formatAdvancedDutyDa6CellLabel(cell))}</td>`).join('')}
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

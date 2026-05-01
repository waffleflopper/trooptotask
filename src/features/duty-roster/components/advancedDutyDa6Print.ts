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

function formatCompactDate(value: string): string {
	return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
		month: 'numeric',
		day: 'numeric'
	});
}

function buildCoverageSummary(matrices: AdvancedDutyDa6Matrix[]): string {
	const coverageLabels = new Set<string>();
	for (const matrix of matrices) {
		for (const column of matrix.columns) {
			coverageLabels.add(formatAdvancedDutyDa6CoverageLabel(column));
		}
	}

	if (coverageLabels.size === 0) return 'Duty window: not set.';
	if (coverageLabels.size === 1) return `Duty window: ${[...coverageLabels][0]}.`;
	return `Duty windows: ${[...coverageLabels].join('; ')}.`;
}

export function printAdvancedDutyDa6Matrices(title: string, matrices: AdvancedDutyDa6Matrix[]): void {
	const printWindow = window.open('', '_blank');
	if (!printWindow) return;
	printWindow.opener = null;
	const safeTitle = escapeHtml(title);
	const safeCoverageSummary = escapeHtml(buildCoverageSummary(matrices));

	const markup = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<style>
@page { size: landscape; margin: 0.35in; }
* { box-sizing: border-box; }
body { font-family: Arial, sans-serif; margin: 0; color: #1f1f1d; font-size: 9px; }
h1, h2, p { margin: 0; }
.header { display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; align-items: end; margin-bottom: 10px; }
h1 { font-size: 16px; line-height: 1.05; }
.print-note { color: #555; font-size: 9px; text-align: right; }
.legend { grid-column: 1 / -1; color: #555; font-size: 8px; }
.matrix { margin-bottom: 14px; break-inside: avoid; }
.matrix-heading { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 5px; }
h2 { font-size: 12px; line-height: 1.05; }
.meta { color: #555; font-size: 8px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.5px; line-height: 1.05; }
th, td { border: 1px solid #cfcfca; padding: 2px 3px; text-align: center; vertical-align: middle; }
th { font-weight: 700; }
th:first-child, td:first-child { text-align: left; width: 1.45in; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
td:not(:first-child), th:not(:first-child) { width: 0.28in; }
</style>
</head>
<body>
<div class="header">
<h1>${safeTitle}</h1>
<p class="print-note">${safeCoverageSummary}</p>
<p class="legend">Legend: X assigned, A authorized absence, D# other duty or blocked, U# misconduct unavailable.</p>
</div>
${matrices
	.map(
		(matrix) => `<section class="matrix">
<div class="matrix-heading">
<h2>${escapeHtml(matrix.roleLabel)}</h2>
<p class="meta">${escapeHtml(matrix.sequenceLabel)} | Pool ${escapeHtml(matrix.rotationPoolKey)}</p>
</div>
<table>
<thead>
<tr>
<th>Name</th>
${matrix.columns
	.map(
		(column) =>
			`<th title="${escapeHtml(formatAdvancedDutyDa6DisplayDate(column.eventDate))}">${escapeHtml(formatCompactDate(column.eventDate))}</th>`
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

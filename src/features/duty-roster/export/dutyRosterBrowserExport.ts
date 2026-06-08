import type { DA6Data } from '../stores/dutyRosterHistory.svelte';
import type { Da6Matrix } from '../run';
import { da6CellGlyph } from '../components/shared/da6MatrixCell';
import {
	displayDutyRosterPersonName,
	getDutyRosterExportDetails,
	type BrowserExportDetails,
	type BrowserExportInput
} from './dutyRosterExportDetails';

function formatDisplayDate(dateStr: string): string {
	const date = new Date(`${dateStr}T00:00:00`);
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(dateStr: string): string {
	const date = new Date(`${dateStr}T00:00:00`);
	return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

function formatDayName(dateStr: string): string {
	const date = new Date(`${dateStr}T00:00:00`);
	return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function escapeHtml(value: string | null | undefined): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function renderRosterRows(details: BrowserExportDetails): string {
	return details.rosterRows
		.map((entry) => {
			const displayDate = formatDisplayDate(entry.date);
			const dayName = formatDayName(entry.date);
			const warningText = entry.warnings?.length ? `Warnings: ${entry.warnings.join('; ')}` : '';
			const generatedText =
				entry.source === 'manual' && entry.generatedAssignee
					? `Generated: ${entry.generatedAssignee.rank} ${displayDutyRosterPersonName(entry.generatedAssignee)}`
					: '';
			const note = [entry.source === 'manual' ? 'MANUAL' : '', generatedText, warningText, entry.reason]
				.filter(Boolean)
				.join(' | ');
			if (!entry.assignee) {
				return `
					<tr class="unavailable">
						<td>${displayDate}</td>
						<td>${dayName}</td>
						<td colspan="3">UNFILLED</td>
						<td>${escapeHtml(note)}</td>
					</tr>
				`;
			}
			return `
				<tr>
					<td>${displayDate}</td>
					<td>${dayName}</td>
						<td>${escapeHtml(displayDutyRosterPersonName(entry.assignee))}</td>
					<td>${escapeHtml(entry.assignee.rank)}</td>
					<td>${escapeHtml(entry.assignee.groupName)}</td>
					<td>${escapeHtml(note)}</td>
				</tr>
			`;
		})
		.join('');
}

function renderDa6Matrix(da6: Da6Matrix): string {
	if (da6.columns.length === 0) return '';

	const headerCells = da6.columns.map((column) => `<th>${formatShortDate(column.date)}</th>`).join('');
	const bodyRows = da6.rows
		.map((row) => {
			const cells = row.cells
				.map((cell) => {
					const glyph = da6CellGlyph(cell);
					const className = cell.assigned ? 'da6-assigned' : 'da6-position';
					return `<td class="${className}">${escapeHtml(glyph)}</td>`;
				})
				.join('');
			return `<tr><td>${escapeHtml(row.display.rank)}</td><td>${escapeHtml(`${row.display.lastName}, ${row.display.firstName}`)}</td>${cells}</tr>`;
		})
		.join('');

	return `
		<h2>DA6 Matrix</h2>
		<p>Authorized markings only: X, roster numbers, A, D#, and U#.</p>
		<table>
			<tr>
				<th>Rank</th>
				<th>Name</th>
				${headerCells}
			</tr>
			${bodyRows}
		</table>
	`;
}

function renderLegacyDa6Grid(da6: DA6Data | null): string {
	if (!da6 || da6.dates.length === 0) return '';

	const headerCells = da6.dates.map((date) => `<th>${formatShortDate(date.date)}</th>`).join('');
	const bodyRows = da6.personnel
		.map((person, index) => {
			const cells = da6.dates
				.map((date) => {
					const position = date.positions[index];
					const assigned = date.assigned?.[index] ?? position === 1;
					if (position === null) {
						return '<td class="da6-unavail">&mdash;</td>';
					}
					if (assigned) {
						return '<td class="da6-assigned">X</td>';
					}
					return `<td class="da6-position">${position}</td>`;
				})
				.join('');
			return `<tr><td>${escapeHtml(person.rank)}</td><td>${escapeHtml(person.name)}</td>${cells}</tr>`;
		})
		.join('');

	return `
		<h2>DA Form 6 Reference</h2>
		<p>Queue position per date. <b>X</b> = assigned duty, number = queue position, <b>&mdash;</b> = unavailable.</p>
		<table>
			<tr>
				<th>Rank</th>
				<th>Name</th>
				${headerCells}
			</tr>
			${bodyRows}
		</table>
	`;
}

export function buildDutyRosterBrowserExportHtml(input: BrowserExportInput): string {
	const details = getDutyRosterExportDetails(input);
	const statusTitle = details.statusLabel ? `${details.statusLabel} ` : '';
	const da6Markup =
		details.da6 && 'rows' in details.da6 ? renderDa6Matrix(details.da6) : renderLegacyDa6Grid(details.da6);

	return `
			<html>
		<head>
			<meta charset="utf-8">
			<style>
				table { border-collapse: collapse; margin-bottom: 24px; }
				th, td { border: 1px solid #000; padding: 8px; text-align: left; }
				th { background-color: #4a5568; color: white; font-weight: bold; }
				.unavailable { background-color: #fed7d7; color: #c53030; }
				.da6-assigned { background-color: #c6f6d5; font-weight: bold; text-align: center; }
				.da6-position { text-align: center; color: #718096; }
				.da6-unavail { text-align: center; color: #a0aec0; background-color: #f7fafc; }
			</style>
		</head>
		<body>
			<h2>${escapeHtml(statusTitle)}${escapeHtml(details.typeName)} Roster</h2>
			<p>Generated: ${new Date().toLocaleDateString()}</p>
			<p>Period: ${formatDisplayDate(details.startDate)} - ${formatDisplayDate(details.endDate)}</p>
			<table>
				<tr>
					<th>Date</th>
					<th>Day</th>
					<th>Assigned</th>
					<th>Rank</th>
					<th>Group</th>
					<th>Notes</th>
				</tr>
				${renderRosterRows(details)}
			</table>
			${da6Markup}
		</body>
	</html>`;
}

export function printDutyRosterForBrowser(input: BrowserExportInput): void {
	const printWindow = window.open('', '_blank');
	if (!printWindow) return;
	printWindow.opener = null;
	printWindow.document.open();
	printWindow.document.write(buildDutyRosterBrowserExportHtml(input));
	printWindow.document.close();
	printWindow.focus();
	printWindow.print();
}
